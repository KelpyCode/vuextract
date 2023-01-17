// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import { Identifier } from "@typescript-eslint/types/dist/generated/ast-spec";
import { NodeTypes } from "@vue/compiler-dom";
import * as vscode from "vscode";
import {
  getDefinitionProvider,
  getHoverProvider,
  getSymbolProvider,
  getTypeOfDefinition,
  showMessage,
} from "./helper";
import { parseTs, traverseTsNode } from "./ts-handler";
import { ParseResult } from "./typings/ts-parser";
import {
  clearCode,
  parseVue,
  getElementsInRange,
  traverseVueNode,
  getAbsoluteLine as getRelativeLine,
  newComponentCall,
  newComponentSource,
  getAbsoluteStart as getAbsoluteLine,
} from "./vue-handler";
import * as path from "path";
import { TextEncoder } from "util";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("Vuextract active");

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json

  let testCommand = vscode.commands.registerCommand(
    "vuextract.testDefinition",
    async () => {
      const editor = vscode.window.activeTextEditor;

      console.log(
        "Testing definition at",
        editor?.selection.start.line, editor?.selection.start.character,
        await getTypeOfDefinition(
          editor?.document.uri!,
          new vscode.Position(
            editor?.selection.start.line!,
            editor?.selection.start.character!
          )
        )
      );

      // console.log(
      //   "Testing definition",
      //   await getSymbolProvider(
      //     editor?.document.uri!
      //   )
      // );
    }
  );

  let extractCommand = vscode.commands.registerCommand(
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
          if (node.type === NodeTypes.INTERPOLATION) {
            evals.push({
              content: (node.content as any).content,
              column: node.content.loc.start.column,
              line: node.content.loc.start.line + absoluteStartLine - 1,
            });

            console.log("Interpolation", {
              column: node.content.loc.start.column,
              line: node.content.loc.start.line + absoluteStartLine,
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

              console.log('Adding identifier', node);

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


        const identifierDefinitions = await Promise.all(identifiers.map(async (x) => { 
          return [x.identifier, await getTypeOfDefinition(
            document.uri,
            new vscode.Position(x.line, x.column),
            true
          )];
        }));

        console.log('Got definitions', identifierDefinitions);

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
              identifierDefinitions
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

  context.subscriptions.push(extractCommand);
  context.subscriptions.push(testCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
