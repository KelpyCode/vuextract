import { AST_NODE_TYPES } from "@typescript-eslint/types";
import { Identifier } from "@typescript-eslint/types/dist/generated/ast-spec";
import {
    DirectiveNode,
    ForNode,
    InterpolationNode,
    NodeTypes
} from "@vue/compiler-dom";
import * as path from "path";
import { TextEncoder } from "util";
import * as vscode from "vscode";
import {
    getTypeOfDefinition,
    showMessage
} from "../helper";
import { parseTs, traverseTsNode } from "../ts-handler";
import { ParseResult } from "../typings/ts-parser";
import {
    getAbsoluteLine as getRelativeLine, getAbsoluteStart as getAbsoluteLine, getElementsInRange, newComponentCall,
    newComponentSource, parseVue, traverseVueNode
} from "../vue-handler";


export let extractCommand = vscode.commands.registerCommand(
    "vuextract.extract",
    async () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      // vscode.window.showInformationMessage('Hello World from vue-extract!');

      // Get the active text editor
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const selection = editor.selection;
        const fullText = document.getText();
        console.log("AST:");
        const parsed = parseVue(fullText);

        console.log("Parsed Vue!", parsed);

        const el = getElementsInRange(fullText, parsed.ast, selection);

        if (!el) {
          showMessage("No element found in selection", "error");
          return;
        }

        //   {
        //     editor.selection = new vscode.Selection(
        //       startLine,
        //       el.loc.start.column - 1,
        //       el.loc.end.line - 1,
        //       el.loc.end.column
        //     );
        //   }

        const lineDiff = el.loc.end.line - el.loc.start.line;
        const relativeStartLine = getRelativeLine(fullText, el.loc.start.line);
        const absoluteStartLine = getAbsoluteLine(fullText);
        const codeRange = {
          startLine: relativeStartLine,
          startCol: el.loc.start.column - 1,
          endLine: relativeStartLine + lineDiff,
          endCol: el.loc.end.column,
        };

        editor.selection = new vscode.Selection(
          codeRange.startLine,
          codeRange.startCol,
          codeRange.endLine,
          codeRange.endCol
        );

        const componentSource = document.getText(
          new vscode.Range(
            codeRange.startLine,
            codeRange.startCol,
            codeRange.endLine,
            codeRange.endCol
          )
        );

        type EvalDef = {
          line: number;
          column: number;
          content: string;
        };

        const evals: EvalDef[] = [];

        traverseVueNode(el, (node) => {
          console.log("Traverse Node ", node, node.type);

          if (node.type === NodeTypes.FOR) {
            console.log("Node for", node);
            const n = node as ForNode;
            const src = n.parseResult.source;

            evals.push({
              content: (src as any).content,
              column: src.loc.start.column,
              line: src.loc.start.line + absoluteStartLine - 1,
            });
          }
          if (node.type === NodeTypes.DIRECTIVE) {
            const n = node as DirectiveNode;
            console.log("Node directive", n);
            if (!n.exp) {
              return;
            }
            evals.push({
              content: (n.exp as any).content,
              column: n.exp.loc.start.column,
              line: n.exp.loc.start.line + absoluteStartLine - 1,
            });
          } else if (node.type === NodeTypes.INTERPOLATION) {
            const n = node as InterpolationNode;
            evals.push({
              content: (n.content as any).content,
              column: n.content.loc.start.column,
              line: n.content.loc.start.line + absoluteStartLine - 1,
            });
          }
        });
        //const tsAst = parseTs("(x + 3 * xy)");

        type IdentifierDef = {
          identifier: Identifier;
          line: number;
          column: number;
        };
        const identifiers: IdentifierDef[] = [];
        const identifierDedup: Set<string> = new Set();

        const collectIdentifiers = (
          ast: ParseResult,
          line: number,
          column: number
        ) => {
          traverseTsNode(ast, (node) => {
            if (node.type === AST_NODE_TYPES.Identifier) {
              const parent = node.parent;

              if (parent && parent.type === AST_NODE_TYPES.MemberExpression) {
                // Ignore if is deep member (only roots)
                if (parent.object !== node) {
                  return;
                }
              }

              console.log("Adding identifier", node);

              if (identifierDedup.has(node.name)) {
                return;
              }
              identifierDedup.add(node.name);
              identifiers.push({
                identifier: node,
                line: node.loc.start.line + line,
                column: node.loc.start.column + column,
              });
            }
          });
        };

        evals
          // .map((e) => parseTs(e))
          .forEach((e) => {
            const tsAst = parseTs(e.content);
            collectIdentifiers(tsAst, e.line, e.column);
          });

        console.log("Got identifiers", identifiers);

        const identifierDefinitions = await Promise.all(
          identifiers.map(async (x) => {
            return [
              x.identifier,
              await getTypeOfDefinition(
                document.uri,
                new vscode.Position(x.line, x.column),
                true
              ),
            ];
          })
        );

        console.log("Got definitions", identifierDefinitions);

        vscode.window
          .showSaveDialog({
            filters: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              "Vue Component": ["vue"],
            },
            title: "Save new component",
          })
          .then((uri) => {
            if (!uri) {
              return;
            }

            const fullPath = uri.path;
            const filename = path.basename(fullPath, ".vue");

            console.log(fullPath, filename);
            editor.edit(
              (eb) => {
                eb.replace(
                  new vscode.Range(
                    new vscode.Position(
                      codeRange.startLine,
                      codeRange.startCol
                    ),
                    new vscode.Position(codeRange.endLine, codeRange.endCol)
                  ),
                  newComponentCall(
                    filename,
                    identifiers.map((x) => x.identifier.name)
                  )
                );
              },
              { undoStopAfter: false, undoStopBefore: false }
            );

            // Edited, now save

            let wsedit = new vscode.WorkspaceEdit();

            const source = newComponentSource(
              filename,
              componentSource,
              identifierDefinitions as any
            );

            {
              const encoder = new TextEncoder();
              wsedit.createFile(uri, {
                contents: encoder.encode(source),
              });
            }
            vscode.workspace.applyEdit(wsedit);
          });

        // vscode.window.showInformationMessage(compileCode(text));
      }
    }
);