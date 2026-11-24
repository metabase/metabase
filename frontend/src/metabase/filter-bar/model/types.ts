import type { FilterStages, FilterTree, PillContent } from "../types";

export type NodeType = Exclude<FilterTree<unknown>["type"], "leaf">;

export type PillToken<F> = { type: "pill"; filter: F; content: PillContent };

export type AndToken = { type: "and" };
export type OrToken = { type: "or" };
export type OpenToken = { type: "open" };
export type CloseToken = { type: "close" };

export type Token<F> =
  | PillToken<F>
  | AndToken
  | OrToken
  | OpenToken
  | CloseToken;

export type TokenType = Token<unknown>["type"];

// The tokens of each stage of the query, by stage index.
export type TokenStages<F> = Token<F>[][];

export type ConnectorToken = AndToken | OrToken;
export type ParenToken = OpenToken | CloseToken;

export type ParseErrorCode =
  | "missing-operand"
  | "empty-parentheses"
  | "missing-closing-parenthesis"
  | "unexpected-closing-parenthesis";

export type ParseError = {
  type: "error";
  code: ParseErrorCode;
  stage: number;
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

export const isConnectorToken = <F>(
  token: Token<F> | undefined,
): token is ConnectorToken => isAndToken(token) || isOrToken(token);
