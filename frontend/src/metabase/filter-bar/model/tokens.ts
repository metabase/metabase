import _ from "underscore";

import type { FilterStages, PillContent } from "../types";

import type { BoolOp } from "./tree";

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

export type BoolOpToken = AndToken | OrToken;
export type ParenToken = OpenToken | CloseToken;
export type ConnectorToken = BoolOpToken | ParenToken;

export type ParseErrorCode =
  | "missing-operand"
  | "empty-parentheses"
  | "missing-closing-parenthesis"
  | "unexpected-closing-parenthesis";

export type ParseError = {
  type: "error";
  code: ParseErrorCode;
  stageIndex: number;
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

export const isBoolOpToken = <F>(
  token: Token<F> | undefined,
): token is BoolOpToken => isAndToken(token) || isOrToken(token);

export const isConnectorToken = <F>(
  token: Token<F> | undefined,
): token is ConnectorToken =>
  isBoolOpToken(token) || isOpenToken(token) || isCloseToken(token);

export const pillToken = <F>(
  filter: F,
  content: PillContent,
): PillToken<F> => ({
  type: "pill",
  filter,
  content,
});

export const boolOpToken = (type: BoolOp): BoolOpToken => ({ type });

export const openToken = (): OpenToken => ({ type: "open" });

export const closeToken = (): CloseToken => ({ type: "close" });

const isSameToken = <F>(token: Token<F>, other: Token<F>) =>
  isPillToken(token)
    ? isPillToken(other) && _.isEqual(token.content, other.content)
    : token.type === other.type;

const dropTrailingEmptyStages = <F>(stages: TokenStages<F>) =>
  stages.slice(0, stages.findLastIndex((tokens) => tokens.length > 0) + 1);

export const isSameStages = <F>(
  stages: TokenStages<F>,
  other: TokenStages<F>,
) => {
  const left = dropTrailingEmptyStages(stages);
  const right = dropTrailingEmptyStages(other);
  return (
    left.length === right.length &&
    left.every(
      (tokens, stage) =>
        tokens.length === right[stage].length &&
        tokens.every((token, index) => isSameToken(token, right[stage][index])),
    )
  );
};

export const hasOr = <F>(tokens: readonly Token<F>[]) => tokens.some(isOrToken);

export const BOOL_OP_TEXT: Record<BoolOpToken["type"], string> = {
  and: "and",
  or: "or",
};

export const PAREN_TEXT: Record<ParenToken["type"], string> = {
  open: "(",
  close: ")",
};

const startsOperand = <F>(token: Token<F>) =>
  isPillToken(token) || isOpenToken(token);

const endsOperand = <F>(token: Token<F> | undefined) =>
  isPillToken(token) || isCloseToken(token);

const writeOutAnds = <F>(tokens: readonly Token<F>[]): Token<F>[] =>
  tokens.flatMap((token, index) =>
    startsOperand(token) && endsOperand(tokens[index - 1])
      ? [boolOpToken("and"), token]
      : [token],
  );

// Product doc: pills side by side are AND-ed, and the AND stays hidden until
// there is an OR; then all ANDs show. Stages can't share an OR, so each stage
// decides on its own.
export const applyImplicitAnds = <F>(stages: TokenStages<F>): TokenStages<F> =>
  stages.map((tokens) =>
    hasOr(tokens)
      ? writeOutAnds(tokens)
      : tokens.filter((token) => !isAndToken(token)),
  );
