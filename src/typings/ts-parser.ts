import type { TSESTree } from "@typescript-eslint/types";


export type ParseResult = TSESTree.Program & {
  range?: [number, number];
  tokens?: TSESTree.Token[];
  comments?: TSESTree.Comment[];
};
