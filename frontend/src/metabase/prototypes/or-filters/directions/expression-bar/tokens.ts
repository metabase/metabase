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
  | { type: "paren"; side: "open" | "close" };

export const OPEN_PAREN: Token = { type: "paren", side: "open" };
export const CLOSE_PAREN: Token = { type: "paren", side: "close" };

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
      (token.type === "paren" && token.side === "open"))
  );
}

// ---------------------------------------------------------------------------
// Query -> tokens
// ---------------------------------------------------------------------------

/**
 * The stage's top-level filters (implicitly AND-ed) as one token stream.
 * Parentheses appear only where precedence needs them: an OR inside an AND.
 * Nested same-operator clauses are flattened.
 */
export function readTokens(query: Lib.Query, stageIndex: number): Token[] {
  const filters = Lib.filters(query, stageIndex);
  // A lone top-level OR has no surrounding AND, so it needs no parentheses.
  const parentOp = filters.length > 1 ? "and" : "or";
  return joinWithOp(
    filters.map((filter) => readClause(query, stageIndex, filter, parentOp)),
    "and",
  );
}

function readClause(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
  parentOp: BoolOperator,
): Token[] {
  const parts = Lib.expressionParts(query, stageIndex, clause);
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
        op,
      ),
    ),
    op,
  );
  const needsParens = op === "or" && parentOp === "and";
  return needsParens ? [OPEN_PAREN, ...tokens, CLOSE_PAREN] : tokens;
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
  | { type: "node"; op: BoolOperator; args: Tree[] };

export type ParseResult =
  | { ok: true; tree: Tree | undefined }
  | { ok: false; error: string; position: number };

/**
 * Recursive descent over the token stream. `and` binds tighter than `or`,
 * as in every query language the bar imitates.
 */
export function parseTokens(tokens: Token[]): ParseResult {
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
): Lib.Query {
  const result = parseTokens(tokens);
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
  return tree.type === "leaf"
    ? tree.clause
    : Lib.expressionClause(tree.op, tree.args.map(toClause));
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
  return undefined;
}
