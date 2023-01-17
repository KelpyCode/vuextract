import * as ts from '@typescript-eslint/parser';
import { AST_TOKEN_TYPES, AST_NODE_TYPES } from '@typescript-eslint/types';
import {  } from '@typescript-eslint/parser';
import type { TSESTree as Type } from "@typescript-eslint/types";
import { ParseResult } from "./typings/ts-parser";
import { simpleTraverse } from './SimpleTraverse';

export function parseTs(code: string) {
    return ts.parse(code, {
        loc: true
    }) as ParseResult;
}


export function traverseTsNode(
  node: Type.Node,
  callback: (node: Type.Node) => void
) {
//   const result = callback(node);
//   if (result === false) {
//     return;
//   }

//   if (node.type === AST_NODE_TYPES.ExpressionStatement) {
//     traverseNode(node.expression, callback);
//   }
    
    simpleTraverse(node, {
        enter(node) {
            callback(node);
        }
    }, true);
}



