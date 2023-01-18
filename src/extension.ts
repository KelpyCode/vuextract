// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import { Identifier } from "@typescript-eslint/types/dist/generated/ast-spec";
import { DirectiveNode, ForNode, InterpolationNode, NodeTypes } from "@vue/compiler-dom";
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
import { extractCommand } from "./commands/extract";

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

  context.subscriptions.push(extractCommand);
  context.subscriptions.push(testCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
