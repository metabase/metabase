import { t } from "ttag";

import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";

/**
 * One flat token stream for the whole expression, the way a search bar
 * (Datadog, GitHub) spells a boolean expression. Filter tokens are atomic and
 * remember which stage their clause lives on; `and`, `or` and parentheses are
 * typed or clicked in between them.
 */
export type BoolOperator = "and" | "or";

export type Token =
  | { type: "filter"; clause: Lib.FilterClause; stageIndex: number }
  | { type: "op"; op: BoolOperator }
  | { type: "paren"; side: "open" | "close" };

/** Negates the operand after it. Only the bars that opt in with `withNot` produce it. */
export type NotToken = { type: "not" };

/** A token of a bar that has `not`; the helpers below take either kind of stream. */
export type ExpressionToken = Token | NotToken;

export const OPEN_PAREN: Token = { type: "paren", side: "open" };
export const CLOSE_PAREN: Token = { type: "paren", side: "close" };
export const NOT_TOKEN: NotToken = { type: "not" };

export function opToken(op: BoolOperator): Token {
  return { type: "op", op };
}

export function filterToken(
  clause: Lib.FilterClause,
  stageIndex: number,
): Token {
  return { type: "filter", clause, stageIndex };
}

/** Does the token end an operand, so a new operand after it needs an operator? */
export function endsOperand(token: ExpressionToken | undefined): boolean {
  return (
    token != null &&
    (token.type === "filter" ||
      (token.type === "paren" && token.side === "close"))
  );
}

/** Does the token start an operand, so an operand before it needs an operator? */
export function startsOperand(token: ExpressionToken | undefined): boolean {
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

export type ReadOptions = {
  /**
   * `true` reads a `not` clause as a `not` token before its operand. Off by
   * default for the bars that have no `not` token: they show it as one pill.
   */
  withNot?: boolean;
  /**
   * `true` also reads the filters of the stage after `stageIndex` (the ones
   * on the summary), AND-ed after the stage's own, so one bar shows both.
   */
  withSummary?: boolean;
};

/**
 * The stage's top-level filters (implicitly AND-ed) as one token stream,
 * followed by the next stage's when `withSummary` is set. Every nested group
 * is parenthesised, even where precedence would not need it, so what the
 * user typed comes back looking the same. Nested same-operator clauses are
 * flattened.
 */
export function readTokens(query: Lib.Query, stageIndex: number): Token[];
export function readTokens(
  query: Lib.Query,
  stageIndex: number,
  options: ReadOptions,
): ExpressionToken[];
export function readTokens(
  query: Lib.Query,
  stageIndex: number,
  options: ReadOptions = {},
): ExpressionToken[] {
  const summaryStageIndex = stageIndex + 1;
  const hasSummaryStage =
    options.withSummary === true && Lib.stageCount(query) > summaryStageIndex;
  const stages = hasSummaryStage
    ? [stageIndex, summaryStageIndex]
    : [stageIndex];
  const filters = stages.flatMap((stage) =>
    Lib.filters(query, stage).map((filter) => ({ stage, filter })),
  );
  // A lone filter is the root of the expression; several share an implicit AND root.
  const depth = filters.length > 1 ? 1 : 0;
  return joinWithOp(
    filters.map(({ stage, filter }) =>
      readClause(query, stage, filter, depth, options),
    ),
    "and",
  );
}

function readClause(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
  depth: number,
  options: ReadOptions,
): ExpressionToken[] {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  if (options.withNot && parts.operator === "not" && parts.args.length === 1) {
    const arg = toFilterClause(
      query,
      stageIndex,
      Lib.expressionClause(parts.args[0]),
    );
    // A depth above zero parenthesises a nested and/or, so `not` covers all of it.
    return [
      NOT_TOKEN,
      ...readClause(query, stageIndex, arg, depth + 1, options),
    ];
  }
  if (parts.operator !== "and" && parts.operator !== "or") {
    return [filterToken(clause, stageIndex)];
  }
  const op = parts.operator;
  const tokens = joinWithOp(
    parts.args.map((arg) =>
      readClause(
        query,
        stageIndex,
        toFilterClause(query, stageIndex, Lib.expressionClause(arg)),
        depth + 1,
        options,
      ),
    ),
    op,
  );
  return depth > 0 ? [OPEN_PAREN, ...tokens, CLOSE_PAREN] : tokens;
}

function joinWithOp(
  groups: ExpressionToken[][],
  op: BoolOperator,
): ExpressionToken[] {
  return groups.flatMap((group, index) =>
    index === 0 ? group : [opToken(op), ...group],
  );
}

// ---------------------------------------------------------------------------
// Tokens -> tree -> query
// ---------------------------------------------------------------------------

type Leaf = {
  type: "leaf";
  clause: Lib.FilterClause;
  stageIndex: number;
  /** Index of the token in the stream, for pointing an error at it. */
  position: number;
};

type Tree =
  | Leaf
  | { type: "node"; op: BoolOperator; args: Tree[] }
  | { type: "not"; arg: Tree };

export type ParseResult =
  | { ok: true; tree: Tree | undefined }
  | { ok: false; error: string; position: number };

/**
 * Recursive descent over the token stream. `and` binds tighter than `or`,
 * as in every query language the bar imitates. A group that mixes filters
 * from two stages is rejected: its clauses would see different tables.
 */
export function parseTokens(tokens: readonly ExpressionToken[]): ParseResult {
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
      const leaf: Leaf = {
        type: "leaf",
        clause: token.clause,
        stageIndex: token.stageIndex,
        position,
      };
      position++;
      return leaf;
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
    const mixedLeaf = findMixedStageLeaf(tree);
    if (mixedLeaf) {
      return {
        ok: false,
        position: mixedLeaf.position,
        error: t`Filters on the summary can't be grouped with filters on rows. Join them with "and".`,
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

/** The root's conjuncts: each must live on one stage; only the root AND may span stages. */
function topLevelConjuncts(tree: Tree): Tree[] {
  return tree.type === "node" && tree.op === "and" ? tree.args : [tree];
}

function leaves(tree: Tree): Leaf[] {
  switch (tree.type) {
    case "leaf":
      return [tree];
    case "not":
      return leaves(tree.arg);
    case "node":
      return tree.args.flatMap(leaves);
  }
}

/** The first leaf whose stage differs from the first leaf of its top-level group. */
function findMixedStageLeaf(tree: Tree): Leaf | undefined {
  for (const conjunct of topLevelConjuncts(tree)) {
    const [first, ...rest] = leaves(conjunct);
    const offender = rest.find((leaf) => leaf.stageIndex !== first.stageIndex);
    if (offender) {
      return offender;
    }
  }
  return undefined;
}

/**
 * Writes the expression back to the query. Each top-level conjunct goes to
 * the stage its filters live on; a top-level AND becomes separate stage
 * filters (today's model), anything else is one filter clause. A stage that
 * ends up without filters is dropped.
 */
export function writeTokens(
  query: Lib.Query,
  stageIndex: number,
  tokens: readonly ExpressionToken[],
  { withSummary = false }: Pick<ReadOptions, "withSummary"> = {},
): Lib.Query {
  const result = parseTokens(tokens);
  if (!result.ok) {
    return query;
  }
  const conjuncts = result.tree ? topLevelConjuncts(result.tree) : [];
  // The summary stage is rewritten even when no token is left for it, so
  // removing its last filter clears it.
  const summaryStageIndex = stageIndex + 1;
  const hasSummaryStage =
    withSummary && Lib.stageCount(query) > summaryStageIndex;
  const stages = new Set([
    stageIndex,
    ...(hasSummaryStage ? [summaryStageIndex] : []),
    ...conjuncts.map((conjunct) => leaves(conjunct)[0].stageIndex),
  ]);
  const written = [...stages]
    .sort((a, b) => a - b)
    .reduce((nextQuery, stage) => {
      const withStage = ensureStage(nextQuery, stage);
      return conjuncts
        .filter((conjunct) => leaves(conjunct)[0].stageIndex === stage)
        .reduce(
          (stageQuery, conjunct) =>
            Lib.filter(stageQuery, stage, toClause(conjunct)),
          clearFilters(withStage, stage),
        );
    }, query);
  return Lib.dropEmptyStages(written);
}

function ensureStage(query: Lib.Query, stageIndex: number): Lib.Query {
  return Lib.stageCount(query) > stageIndex
    ? query
    : ensureStage(Lib.appendStage(query), stageIndex);
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
export function insertToken<T extends ExpressionToken>(
  tokens: readonly T[],
  caret: number,
  token: T,
): { tokens: (T | Token)[]; caret: number } {
  const before = tokens.slice(0, caret);
  const after = tokens.slice(caret);
  const inserted: (T | Token)[] = [];
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

/**
 * Appends `token` as the last AND-ed conjunct. When the expression's top
 * level is an `or`, it is wrapped in parentheses first, so the new conjunct
 * applies to all of it rather than to the last branch only.
 */
export function appendConjunct<T extends ExpressionToken>(
  tokens: readonly T[],
  token: T,
): { tokens: (T | Token)[]; caret: number; wrapped: boolean } {
  // A trailing "and" the user already typed is the one the append supplies.
  const last = tokens.at(-1);
  const expression =
    last?.type === "op" && last.op === "and" ? tokens.slice(0, -1) : tokens;
  const wrapped = needsWrapForConjunct(expression);
  const base: (T | Token)[] = wrapped
    ? [OPEN_PAREN, ...expression, CLOSE_PAREN]
    : [...expression];
  return { ...insertToken(base, base.length, token), wrapped };
}

function needsWrapForConjunct(tokens: readonly ExpressionToken[]): boolean {
  const parsed = parseTokens(tokens);
  const isTopLevelOr =
    parsed.ok && parsed.tree?.type === "node" && parsed.tree.op === "or";
  return isTopLevelOr && !isWrappedInParens(tokens);
}

/** Does one pair of parentheses enclose the whole stream? */
function isWrappedInParens(tokens: readonly ExpressionToken[]): boolean {
  const first = tokens[0];
  if (first?.type !== "paren" || first.side !== "open") {
    return false;
  }
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.type === "paren") {
      depth += token.side === "open" ? 1 : -1;
    }
    if (depth === 0) {
      return index === tokens.length - 1;
    }
  }
  return false;
}

export function removeTokenAt<T extends ExpressionToken>(
  tokens: readonly T[],
  index: number,
): T[] {
  return tokens.filter((_, i) => i !== index);
}

export function replaceTokenAt<T extends ExpressionToken>(
  tokens: readonly T[],
  index: number,
  token: T,
): T[] {
  return tokens.map((existing, i) => (i === index ? token : existing));
}

export function toggleOperator(op: BoolOperator): BoolOperator {
  return op === "and" ? "or" : "and";
}

/** Parses typed text into an operator or paren token, when it is one. */
export function parseTypedToken(text: string): Token | undefined;
export function parseTypedToken(
  text: string,
  options: ReadOptions,
): ExpressionToken | undefined;
export function parseTypedToken(
  text: string,
  { withNot = false }: ReadOptions = {},
): ExpressionToken | undefined {
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
  if (withNot && (word === "not" || word === "!")) {
    return NOT_TOKEN;
  }
  return undefined;
}
