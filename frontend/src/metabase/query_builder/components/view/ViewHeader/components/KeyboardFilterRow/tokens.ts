import { t } from "ttag";

import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

/**
 * Prototype: the stage's filters as one flat token stream, the way a search
 * bar spells a boolean expression. Filter tokens are atomic; `or` and
 * parentheses are typed or clicked in between them, and `and` is implicit.
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

export function isOpToken(token: Token | undefined, op?: BoolOperator) {
  return token?.type === "op" && (op == null || token.op === op);
}

export function isParenToken(
  token: Token | undefined,
  side?: "open" | "close",
) {
  return token?.type === "paren" && (side == null || token.side === side);
}

/** Does the token end an operand, so a new operand after it needs an operator? */
export function endsOperand(token: Token | undefined): boolean {
  return token?.type === "filter" || isParenToken(token, "close");
}

/** Does the token start an operand, so an operand before it needs an operator? */
export function startsOperand(token: Token | undefined): boolean {
  return token?.type === "filter" || isParenToken(token, "open");
}

// ---------------------------------------------------------------------------
// Clauses
// ---------------------------------------------------------------------------

export function clearFilters(query: Lib.Query, stageIndex: number): Lib.Query {
  return Lib.filters(query, stageIndex).reduce(
    (nextQuery, filter) => Lib.removeClause(nextQuery, stageIndex, filter),
    query,
  );
}

/**
 * Anything the filter pickers hand back (a filter clause, an expression
 * clause or a segment) as a `FilterClause`, by adding it to a filter-free
 * scratch copy of the query and reading it back. The scratch query must start
 * empty: `Lib.filter` ignores a clause equal to an existing one, which would
 * hand back that existing clause and duplicate its uuid.
 */
export function toFilterClause(
  query: Lib.Query,
  stageIndex: number,
  filterable: Lib.Filterable,
): Lib.FilterClause {
  const scratch = Lib.filter(
    clearFilters(query, stageIndex),
    stageIndex,
    filterable,
  );
  return checkNotNull(Lib.filters(scratch, stageIndex).at(0));
}

export function getFilterLabel(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): string {
  return Lib.displayInfo(query, stageIndex, filter).longDisplayName;
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
  | { type: "node"; op: BoolOperator; args: Tree[] };

export type ParseResult =
  | { ok: true; tree: Tree | undefined }
  | {
      ok: false;
      error: string;
      /** The token the parser stopped at. */
      position: number;
      /** Every token to mark: both filters, when a connector is missing between them. */
      positions: number[];
    };

const missingConnectorError = () =>
  t`Two filters need an "and" or "or" between them`;

class ParseError extends Error {
  positions: number[];
  constructor(message: string, positions: number[]) {
    super(message);
    this.positions = positions;
  }
}

/**
 * Recursive descent over the token stream. `and` binds tighter than `or`,
 * as in every query language the bar imitates.
 */
export function parseTokens(tokens: readonly Token[]): ParseResult {
  if (tokens.length === 0) {
    return { ok: true, tree: undefined };
  }
  let position = 0;

  const peek = () => tokens[position];
  const fail = (error: string, positions = [position]): never => {
    throw new ParseError(error, positions);
  };

  const parseOr = (): Tree => {
    const args = [parseAnd()];
    while (isOpToken(peek(), "or")) {
      position++;
      args.push(parseAnd());
    }
    return args.length === 1 ? args[0] : { type: "node", op: "or", args };
  };

  const parseAnd = (): Tree => {
    const args = [parseOperand()];
    while (isOpToken(peek(), "and")) {
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
      if (isParenToken(peek(), "close")) {
        return fail(t`Empty parentheses`);
      }
      const inner = parseOr();
      if (startsOperand(peek())) {
        return fail(missingConnectorError(), [position - 1, position]);
      }
      if (!isParenToken(peek(), "close")) {
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
      return token.type === "paren"
        ? {
            ok: false,
            position,
            positions: [position],
            error: t`Unexpected closing parenthesis`,
          }
        : {
            ok: false,
            position,
            positions: [position - 1, position],
            error: missingConnectorError(),
          };
    }
    return { ok: true, tree };
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        ok: false,
        error: error.message,
        position: error.positions[error.positions.length - 1],
        positions: error.positions,
      };
    }
    throw error;
  }
}

/**
 * Writes the expression back to the stage. A top-level AND becomes separate
 * stage filters (today's model); anything else is one filter clause. An
 * expression that does not parse leaves the query as it is.
 */
export function writeTokens(
  query: Lib.Query,
  stageIndex: number,
  tokens: readonly Token[],
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
  switch (tree.type) {
    case "leaf":
      return tree.clause;
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
  tokens: readonly Token[],
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

export function removeTokenAt(
  tokens: readonly Token[],
  index: number,
): Token[] {
  return tokens.filter((_, i) => i !== index);
}

/** Removes a pill and the AND / OR it would leave dangling, so the rest stays valid. */
export function removePillAt(tokens: readonly Token[], index: number): Token[] {
  const before = tokens[index - 1];
  const after = tokens[index + 1];
  const next = removeTokenAt(tokens, index);
  if (
    isOpToken(before) &&
    (after == null || isOpToken(after) || isParenToken(after, "close"))
  ) {
    return removeTokenAt(next, index - 1);
  }
  if (isOpToken(after) && (before == null || isParenToken(before, "open"))) {
    return removeTokenAt(next, index);
  }
  return next;
}

/** The index of the parenthesis that closes or opens the one at `index`, if any. */
export function findParenPair(
  tokens: readonly Token[],
  index: number,
): number | undefined {
  const token = tokens[index];
  if (token?.type !== "paren") {
    return undefined;
  }
  const step = token.side === "open" ? 1 : -1;
  let depth = 0;
  for (let at = index; at >= 0 && at < tokens.length; at += step) {
    const other = tokens[at];
    if (other.type !== "paren") {
      continue;
    }
    depth += other.side === token.side ? 1 : -1;
    if (depth === 0) {
      return at;
    }
  }
  return undefined;
}

/** Removes a parenthesis with its pair, so the group's pills stay where they are. */
export function removeParenPair(
  tokens: readonly Token[],
  index: number,
): Token[] {
  const pair = findParenPair(tokens, index);
  return tokens.filter((_, at) => at !== index && at !== pair);
}

export function replaceTokenAt(
  tokens: readonly Token[],
  index: number,
  token: Token,
): Token[] {
  return tokens.map((existing, i) => (i === index ? token : existing));
}

/** Nesting depth per token, so nested parens fade. */
export function getParenDepths(tokens: readonly Token[]): number[] {
  let depth = 0;
  return tokens.map((token) => {
    if (token.type !== "paren") {
      return depth;
    }
    if (token.side === "open") {
      return depth++;
    }
    depth = Math.max(depth - 1, 0);
    return depth;
  });
}

/**
 * Prototype: the tokens of a logic expression from the AI, like "0 or (1 and
 * 2)", where the numbers are the indexes of `filterTokens`. Undefined when the
 * expression does not use each filter exactly once, or does not parse.
 */
export function getLogicTokens(
  logic: string,
  filterTokens: readonly Token[],
): Token[] | undefined {
  const words = logic.toLowerCase().match(/\d+|and|or|\(|\)|\S/g) ?? [];
  const usedIndexes = new Set<number>();
  const tokens: Token[] = [];
  for (const word of words) {
    if (word === "and" || word === "or") {
      tokens.push(opToken(word));
    } else if (word === "(") {
      tokens.push(OPEN_PAREN);
    } else if (word === ")") {
      tokens.push(CLOSE_PAREN);
    } else {
      const index = Number(word);
      const filterToken = filterTokens[index];
      if (!Number.isInteger(index) || filterToken == null) {
        return undefined;
      }
      if (usedIndexes.has(index)) {
        return undefined;
      }
      usedIndexes.add(index);
      tokens.push(filterToken);
    }
  }
  return usedIndexes.size === filterTokens.length && parseTokens(tokens).ok
    ? tokens
    : undefined;
}

export function hasTopLevelOr(tokens: readonly Token[]): boolean {
  let depth = 0;
  return tokens.some((token) => {
    if (token.type === "paren") {
      depth += token.side === "open" ? 1 : -1;
    }
    return depth === 0 && isOpToken(token, "or");
  });
}

// ---------------------------------------------------------------------------
// Typed logic keywords
// ---------------------------------------------------------------------------

export type LogicKeyword = {
  label: string;
  token: Token;
  /** What typing can spell on the way to this keyword. */
  spellings: string[];
};

/** The bar offers AND only while ANDs are visible, beside an OR. */
export const LOGIC_KEYWORDS: LogicKeyword[] = [
  { label: "AND", token: opToken("and"), spellings: ["and", "&&"] },
  { label: "OR", token: opToken("or"), spellings: ["or", "||"] },
  { label: "(", token: OPEN_PAREN, spellings: ["("] },
  { label: ")", token: CLOSE_PAREN, spellings: [")"] },
];

/** The keyword the typed text is on its way to, if any. */
export function matchLogic(text: string): LogicKeyword | undefined {
  const word = text.trim().toLowerCase();
  return word.length === 0
    ? undefined
    : LOGIC_KEYWORDS.find(({ spellings }) =>
        spellings.some((spelling) => spelling.startsWith(word)),
      );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * The stage that filters the summary: the one after the last stage with an
 * aggregation. Undefined when nothing is summarized.
 */
export function getSummaryStageIndex(query: Lib.Query): number | undefined {
  const lastAggregatedStage = Lib.stageIndexes(query)
    .filter((stageIndex) => Lib.aggregations(query, stageIndex).length > 0)
    .at(-1);
  return lastAggregatedStage == null ? undefined : lastAggregatedStage + 1;
}
