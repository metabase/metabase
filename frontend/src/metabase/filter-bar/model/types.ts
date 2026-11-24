import type { FilterStages, FilterTree, PillContent } from "../types";

export type NodeType = Exclude<FilterTree<unknown>["type"], "leaf">;

export type PillToken<F> = { type: "pill"; filter: F; content: PillContent };

// Stages without filters have no tokens at all, so a `then` stores the stage it
// opens instead of the stage being counted by `then`s. Hidden tokens would make
// the caret, Backspace and selection skip what the user can't see.
export type ThenToken = { type: "then"; stage: number };

export type AndToken = { type: "and" };
export type OrToken = { type: "or" };
export type OpenToken = { type: "open" };
export type CloseToken = { type: "close" };

export type Token<F> =
  | PillToken<F>
  | AndToken
  | OrToken
  | OpenToken
  | CloseToken
  | ThenToken;

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

export const isPillToken = <F>(
  token: Token<F> | undefined,
): token is PillToken<F> => token?.type === "pill";

export const isAndToken = <F>(token: Token<F> | undefined): token is AndToken =>
  token?.type === "and";

export const isOrToken = <F>(token: Token<F> | undefined): token is OrToken =>
  token?.type === "or";

export const isOpenToken = <F>(
  token: Token<F> | undefined,
): token is OpenToken => token?.type === "open";

export const isCloseToken = <F>(
  token: Token<F> | undefined,
): token is CloseToken => token?.type === "close";

export const isThenToken = <F>(
  token: Token<F> | undefined,
): token is ThenToken => token?.type === "then";
