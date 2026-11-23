import type { FilterStages, FilterTree, PillContent } from "../types";

export type NodeType = Exclude<FilterTree<unknown>["type"], "leaf">;

export type PillToken<F> = { type: "pill"; filter: F; content: PillContent };

export type Token<F> =
  | PillToken<F>
  | { type: "and" }
  | { type: "or" }
  | { type: "open" }
  | { type: "close" }
  | { type: "then" };

export type ParseErrorCode =
  | "missing-filter"
  | "missing-connector"
  | "empty-parentheses"
  | "missing-closing-parenthesis"
  | "unexpected-closing-parenthesis";

export type ParseError = {
  type: "error";
  code: ParseErrorCode;
  indexes: readonly number[];
};

export type ParseResult<F> =
  | { type: "ok"; stages: FilterStages<F> }
  | ParseError;
