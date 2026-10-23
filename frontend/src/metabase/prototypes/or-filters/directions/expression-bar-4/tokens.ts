import { t } from "ttag";

import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";

/**
 * Direction B: the stage's filters as one flat token stream, the way a search
 * bar (Datadog, GitHub) spells a boolean expression. Filter tokens are atomic;
 * `and`, `or` and parentheses are typed or clicked in between them.
 */
export type BoolOperator = "and" | "or";

export type Token =
  | { type: "filter"; clause: Lib.FilterClause }
  | { type: "op"; op: BoolOperator }
  | { type: "paren"; side: "open" | "close" }
  | { type: "not" };

export const OPEN_PAREN: Token = { type: "paren", side: "open" };
export const CLOSE_PAREN: Token = { type: "paren", side: "close" };
export const NOT_TOKEN: Token = { type: "not" };

export function opToken(op: BoolOperator): Token {
  return { type: "op", op };
}

export function filterToken(clause: Lib.FilterClause): Token {
  return { type: "filter", clause };
}

/** Does the token end an operand, so a new operand after it needs an operator? */
export function endsOperand(token: Token | undefined): boolean {
  return (
    token != null &&
    (token.type === "filter" ||
      (token.type === "paren" && token.side === "close"))
  );
}

/** Does the token start an operand, so an operand before it needs an operator? */
export function startsOperand(token: Token | undefined): boolean {
  return (
    token != null &&
    (token.type === "filter" ||
      token.type === "not" ||
      (token.type === "paren" && token.side === "open"))
  );
}

// ---------------------------------------------------------------------------
// Query -> tokens
// ---------------------------------------------------------------------------

/**
 * The stage's top-level filters (implicitly AND-ed) as one token stream.
 * Every nested group is parenthesised, even where precedence would not need
 * it, so what the user typed comes back looking the same. Nested
 * same-operator clauses are flattened.
 */
export function readTokens(query: Lib.Query, stageIndex: number): Token[] {
  const filters = Lib.filters(query, stageIndex);
  // A lone filter is the root of the expression; several share an implicit AND root.
  const depth = filters.length > 1 ? 1 : 0;
  return joinWithOp(
    filters.map((filter) => readClause(query, stageIndex, filter, depth)),
    "and",
  );
}

function readClause(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
  depth: number,
): Token[] {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  if (parts.operator === "not" && parts.args.length === 1) {
    const arg = toFilterClause(
      query,
      stageIndex,
      Lib.expressionClause(parts.args[0]),
    );
    // A depth above zero parenthesises a nested and/or, so `not` covers all of it.
    return [NOT_TOKEN, ...readClause(query, stageIndex, arg, depth + 1)];
  }
  if (parts.operator !== "and" && parts.operator !== "or") {
    return [filterToken(clause)];
  }
  const op = parts.operator;
  const tokens = joinWithOp(
    parts.args.map((arg) =>
      readClause(
        query,
        stageIndex,
        toFilterClause(query, stageIndex, Lib.expressionClause(arg)),
        depth + 1,
      ),
    ),
    op,
  );
  return depth > 0 ? [OPEN_PAREN, ...tokens, CLOSE_PAREN] : tokens;
}

function joinWithOp(groups: Token[][], op: BoolOperator): Token[] {
  return groups.flatMap((group, index) =>
    index === 0 ? group : [opToken(op), ...group],
  );
}

// ---------------------------------------------------------------------------
// Tokens -> tree -> query
// ---------------------------------------------------------------------------

type Tree =
  | { type: "leaf"; clause: Lib.FilterClause }
  | { type: "node"; op: BoolOperator; args: Tree[] }
  | { type: "not"; arg: Tree };

export type ParseResult =
  | { ok: true; tree: Tree | undefined }
  | { ok: false; error: string; position: number };

export type ParseOptions = {
  /**
   * `false` for a segment after a summary: its clauses can only be AND-ed,
   * because an OR with the rows before the summary is not one query.
   */
  allowOr?: boolean;
};

const orAfterSummaryError = () =>
  t`Filters on the summary can only be combined with "and"`;

/**
 * Recursive descent over the token stream. `and` binds tighter than `or`,
 * as in every query language the bar imitates.
 */
export function parseTokens(
  tokens: Token[],
  { allowOr = true }: ParseOptions = {},
): ParseResult {
  if (tokens.length === 0) {
    return { ok: true, tree: undefined };
  }
  let position = 0;

  const peek = () => tokens[position];
  const peekIsOp = (op: BoolOperator) => {
    const token = peek();
    return token?.type === "op" && token.op === op;
  };
  const peekIsParen = (side: "open" | "close") => {
    const token = peek();
    return token?.type === "paren" && token.side === side;
  };
  const fail = (error: string): never => {
    throw new ParseError(error, position);
  };

  const parseOr = (): Tree => {
    const args = [parseAnd()];
    while (peekIsOp("or")) {
      if (!allowOr) {
        return fail(orAfterSummaryError());
      }
      position++;
      args.push(parseAnd());
    }
    return args.length === 1 ? args[0] : { type: "node", op: "or", args };
  };

  const parseAnd = (): Tree => {
    const args = [parseOperand()];
    while (peekIsOp("and")) {
      position++;
      args.push(parseOperand());
    }
    return args.length === 1 ? args[0] : { type: "node", op: "and", args };
  };

  const parseOperand = (): Tree => {
    const token = peek();
    if (token == null) {
      return fail(t`Expected a filter at the end`);
    }
    if (token.type === "filter") {
      position++;
      return { type: "leaf", clause: token.clause };
    }
    if (token.type === "not") {
      position++;
      return { type: "not", arg: parseOperand() };
    }
    if (token.type === "paren" && token.side === "open") {
      position++;
      if (peekIsParen("close")) {
        return fail(t`Empty parentheses`);
      }
      const inner = parseOr();
      if (!peekIsParen("close")) {
        return fail(t`Missing closing parenthesis`);
      }
      position++;
      return inner;
    }
    if (token.type === "paren") {
      return fail(t`Unexpected closing parenthesis`);
    }
    if (token.op === "or" && !allowOr) {
      return fail(orAfterSummaryError());
    }
    return fail(t`Expected a filter before "${token.op}"`);
  };

  try {
    const tree = parseOr();
    if (position < tokens.length) {
      const token = tokens[position];
      return {
        ok: false,
        position,
        error:
          token.type === "paren"
            ? t`Unexpected closing parenthesis`
            : t`Two filters need an "and" or "or" between them`,
      };
    }
    return { ok: true, tree };
  } catch (error) {
    if (error instanceof ParseError) {
      return { ok: false, error: error.message, position: error.position };
    }
    throw error;
  }
}

class ParseError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

/**
 * Writes the expression back to the stage. A top-level AND becomes separate
 * stage filters (today's model); anything else is one filter clause.
 */
export function writeTokens(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
  options?: ParseOptions,
): Lib.Query {
  const result = parseTokens(tokens, options);
  if (!result.ok) {
    return query;
  }
  const cleared = clearFilters(query, stageIndex);
  if (result.tree == null) {
    return cleared;
  }
  const topLevel =
    result.tree.type === "node" && result.tree.op === "and"
      ? result.tree.args
      : [result.tree];
  return topLevel.reduce(
    (nextQuery, tree) => Lib.filter(nextQuery, stageIndex, toClause(tree)),
    cleared,
  );
}

function toClause(tree: Tree): Lib.FilterClause | Lib.ExpressionClause {
  switch (tree.type) {
    case "leaf":
      return tree.clause;
    case "not":
      return Lib.expressionClause("not", [toClause(tree.arg)]);
    case "node":
      return Lib.expressionClause(tree.op, tree.args.map(toClause));
  }
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

/**
 * Inserts `token` at `caret`, adding an implicit `and` when two operands
 * would otherwise touch (typing a filter right after another one).
 */
export function insertToken(
  tokens: Token[],
  caret: number,
  token: Token,
): { tokens: Token[]; caret: number } {
  const before = tokens.slice(0, caret);
  const after = tokens.slice(caret);
  const inserted: Token[] = [];
  if (startsOperand(token) && endsOperand(before.at(-1))) {
    inserted.push(opToken("and"));
  }
  inserted.push(token);
  if (endsOperand(token) && startsOperand(after[0])) {
    inserted.push(opToken("and"));
  }
  const nextTokens = [...before, ...inserted, ...after];
  // The caret lands right after the inserted token, before any trailing `and`.
  const caretAfterToken = before.length + inserted.indexOf(token) + 1;
  return { tokens: nextTokens, caret: caretAfterToken };
}

export function removeTokenAt(tokens: Token[], index: number): Token[] {
  return tokens.filter((_, i) => i !== index);
}

export function replaceTokenAt(
  tokens: Token[],
  index: number,
  token: Token,
): Token[] {
  return tokens.map((existing, i) => (i === index ? token : existing));
}

export function toggleOperator(op: BoolOperator): BoolOperator {
  return op === "and" ? "or" : "and";
}

/** Parses typed text into an operator or paren token, when it is one. */
export function parseTypedToken(text: string): Token | undefined {
  const word = text.trim().toLowerCase();
  if (word === "(") {
    return OPEN_PAREN;
  }
  if (word === ")") {
    return CLOSE_PAREN;
  }
  if (word === "and" || word === "&&" || word === "&") {
    return opToken("and");
  }
  if (word === "or" || word === "||" || word === "|") {
    return opToken("or");
  }
  if (word === "not" || word === "!") {
    return NOT_TOKEN;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Structure editing: ranges are half-open token index ranges [start, end).
// ---------------------------------------------------------------------------

export type TokenRange = { start: number; end: number };

function isParen(token: Token | undefined, side: "open" | "close"): boolean {
  return token?.type === "paren" && token.side === side;
}

/** The index of the parenthesis paired with the one at `index`, if it is balanced. */
export function matchingParen(
  tokens: readonly Token[],
  index: number,
): number | undefined {
  const token = tokens[index];
  if (token?.type !== "paren") {
    return undefined;
  }
  const step = token.side === "open" ? 1 : -1;
  let depth = 0;
  for (let i = index; i >= 0 && i < tokens.length; i += step) {
    if (isParen(tokens[i], token.side)) {
      depth++;
    } else if (tokens[i].type === "paren") {
      depth--;
    }
    if (depth === 0) {
      return i;
    }
  }
  return undefined;
}

/** The range of a parenthesised group given either of its parentheses. */
export function parenGroupRange(
  tokens: readonly Token[],
  index: number,
): TokenRange | undefined {
  const match = matchingParen(tokens, index);
  if (match == null) {
    return undefined;
  }
  return { start: Math.min(index, match), end: Math.max(index, match) + 1 };
}

/**
 * The operand right next to the operator at `index`: a filter or a whole
 * parenthesised group, with any `not`s in front of it.
 */
export function operandRange(
  tokens: readonly Token[],
  index: number,
  side: "left" | "right",
): TokenRange | undefined {
  if (side === "right") {
    const start = index + 1;
    let position = start;
    while (tokens[position]?.type === "not") {
      position++;
    }
    const token = tokens[position];
    if (token?.type === "filter") {
      return { start, end: position + 1 };
    }
    if (isParen(token, "open")) {
      const group = parenGroupRange(tokens, position);
      return group && { start, end: group.end };
    }
    return undefined;
  }

  const end = index;
  const token = tokens[end - 1];
  let start: number;
  if (token?.type === "filter") {
    start = end - 1;
  } else if (isParen(token, "close")) {
    const group = parenGroupRange(tokens, end - 1);
    if (group == null) {
      return undefined;
    }
    start = group.start;
  } else {
    return undefined;
  }
  while (tokens[start - 1]?.type === "not") {
    start--;
  }
  return { start, end };
}

/** The tokens inside the innermost parentheses around `index`, or the whole stream. */
export function enclosingGroup(
  tokens: readonly Token[],
  index: number,
): TokenRange {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (isParen(tokens[i], "close")) {
      depth++;
    } else if (isParen(tokens[i], "open")) {
      if (depth === 0) {
        const match = matchingParen(tokens, i);
        return { start: i + 1, end: match ?? tokens.length };
      }
      depth--;
    }
  }
  return { start: 0, end: tokens.length };
}

export function wrapRange(
  tokens: readonly Token[],
  { start, end }: TokenRange,
): Token[] {
  return [
    ...tokens.slice(0, start),
    OPEN_PAREN,
    ...tokens.slice(start, end),
    CLOSE_PAREN,
    ...tokens.slice(end),
  ];
}

/** Wraps the range in `not (…)`; a lone filter gets no parentheses. */
export function negateRange(
  tokens: readonly Token[],
  range: TokenRange,
): Token[] {
  const isSingleFilter =
    range.end - range.start === 1 && tokens[range.start]?.type === "filter";
  const wrapped = isSingleFilter ? [...tokens] : wrapRange(tokens, range);
  return [
    ...wrapped.slice(0, range.start),
    NOT_TOKEN,
    ...wrapped.slice(range.start),
  ];
}

/**
 * Removes the range and one operator next to it (the one before, else the
 * one after), so the operands either side don't end up touching.
 */
export function removeRange(
  tokens: readonly Token[],
  { start, end }: TokenRange,
): { tokens: Token[]; caret: number } {
  const hasOpBefore = tokens[start - 1]?.type === "op";
  const hasOpAfter = !hasOpBefore && tokens[end]?.type === "op";
  const from = hasOpBefore ? start - 1 : start;
  const to = hasOpAfter ? end + 1 : end;
  return {
    tokens: [...tokens.slice(0, from), ...tokens.slice(to)],
    caret: from,
  };
}

/** Drops both parentheses of a group, keeping what was inside. */
export function removeParenPair(
  tokens: readonly Token[],
  index: number,
): Token[] {
  const match = matchingParen(tokens, index);
  return tokens.filter((_, i) => i !== index && i !== match);
}

/** Sets the operators that sit directly in the range (not inside nested parentheses). */
export function setOperators(
  tokens: readonly Token[],
  { start, end }: TokenRange,
  op: BoolOperator,
): Token[] {
  let depth = 0;
  return tokens.map((token, i) => {
    if (i < start || i >= end) {
      return token;
    }
    if (isParen(token, "open")) {
      depth++;
    } else if (isParen(token, "close")) {
      depth--;
    } else if (token.type === "op" && depth <= 0) {
      return opToken(op);
    }
    return token;
  });
}
