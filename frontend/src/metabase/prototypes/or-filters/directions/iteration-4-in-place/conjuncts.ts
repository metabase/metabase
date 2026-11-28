import {
  type Token,
  appendConjunct,
  opToken,
  parseTokens,
} from "../expression-bar-unified/tokens";

/**
 * The bar as a chain of top-level AND-ed conjuncts. A conjunct is one filter,
 * or a parenthesised group; the `and` tokens between them are left out.
 */
export function splitConjuncts(tokens: readonly Token[]): Token[][] {
  // An `or` at the top binds looser than every `and`: the whole stream is one operand then.
  if (hasTopLevelOr(tokens)) {
    return tokens.length > 0 ? [[...tokens]] : [];
  }
  const conjuncts: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === "paren") {
      depth += token.side === "open" ? 1 : -1;
    }
    if (depth === 0 && token.type === "op" && token.op === "and") {
      conjuncts.push([]);
    } else {
      conjuncts[conjuncts.length - 1].push(token);
    }
  }
  return conjuncts.filter((conjunct) => conjunct.length > 0);
}

function hasTopLevelOr(tokens: readonly Token[]): boolean {
  let depth = 0;
  return tokens.some((token) => {
    if (token.type === "paren") {
      depth += token.side === "open" ? 1 : -1;
    }
    return depth === 0 && token.type === "op" && token.op === "or";
  });
}

export function joinConjuncts(conjuncts: readonly Token[][]): Token[] {
  return conjuncts.flatMap((conjunct, index) =>
    index === 0 ? conjunct : [opToken("and"), ...conjunct],
  );
}

export type KeyOf = (token: Token) => string;

function conjunctKey(conjunct: readonly Token[], keyOf: KeyOf): string {
  return conjunct.map(keyOf).join(" ");
}

// ---------------------------------------------------------------------------
// Order memory
// ---------------------------------------------------------------------------

/**
 * The query keeps the rows' filters on one stage and the summary's on the
 * next, so reading it back would always list the summary's last. The bar
 * remembers the order the user left the conjuncts in and restores it on
 * read; conjuncts it has not seen (a drill's, an example's) go at the end.
 * One memory for every bar on the page, so the notebook and the chill bar
 * agree.
 */
let rememberedOrder: string[] = [];

export function rememberOrder(tokens: readonly Token[], keyOf: KeyOf) {
  rememberedOrder = splitConjuncts(tokens).map((conjunct) =>
    conjunctKey(conjunct, keyOf),
  );
}

export function applyRememberedOrder(
  tokens: readonly Token[],
  keyOf: KeyOf,
): Token[] {
  const conjuncts = splitConjuncts(tokens);
  if (conjuncts.length < 2) {
    return [...tokens];
  }
  const rank = (conjunct: Token[]) => {
    const index = rememberedOrder.indexOf(conjunctKey(conjunct, keyOf));
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  const sorted = conjuncts
    .map((conjunct, index) => ({ conjunct, index, rank: rank(conjunct) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ conjunct }) => conjunct);
  return joinConjuncts(sorted);
}

// ---------------------------------------------------------------------------
// Relocation
// ---------------------------------------------------------------------------

export type FilterToken = Extract<Token, { type: "filter" }>;

export type Relocation = {
  tokens: Token[];
  /** The summary filters that were carried to the end, in stream order. */
  moved: FilterToken[];
  /** Whether any of them sat inside an `or` (rather than a parenthesised AND group). */
  hadOr: boolean;
};

const isFilter = (token: Token) => token.type === "filter";
const isOr = (token: Token) => token.type === "op" && token.op === "or";
const isOpen = (token?: Token) =>
  token?.type === "paren" && token.side === "open";
const isClose = (token?: Token) =>
  token?.type === "paren" && token.side === "close";

/**
 * The rule of the bar: a filter on the summary never shares a group with a
 * filter on the rows (they see different tables), and a filter on an
 * aggregation (Count, Sum of Total…) is only ever a top-level conjunct on
 * its own. Wherever the stream is complete and breaks that rule, the
 * offending summary filters are pulled out of their group and AND-ed on at
 * the end, the group's `or` wrapped in parentheses so they apply to all of
 * it. Returns `undefined` while the stream is incomplete, or already follows
 * the rule.
 */
export function relocateSummaryFilters(
  tokens: readonly Token[],
  stageIndex: number,
  isMeasure: (token: FilterToken) => boolean,
): Relocation | undefined {
  if (!isComplete(tokens, stageIndex)) {
    return undefined;
  }
  const moved: FilterToken[] = [];
  let hadOr = false;
  const kept = splitConjuncts(tokens).flatMap((conjunct) => {
    const filters = conjunct.filter(isFilter);
    const summaries = filters.filter(
      (token): token is FilterToken =>
        token.type === "filter" && token.stageIndex !== stageIndex,
    );
    const hasRows = filters.length > summaries.length;
    // Mixed with rows, every summary filter leaves; among summary filters
    // only, the aggregations leave (a breakout's values may still be or-ed).
    const offending = hasRows
      ? summaries
      : filters.length > 1
        ? summaries.filter(isMeasure)
        : [];
    if (offending.length === 0) {
      return [conjunct];
    }
    moved.push(...offending);
    hadOr ||= conjunct.some(isOr);
    const remaining = offending.reduce(removeOperand, conjunct);
    return remaining.length > 0 ? [remaining] : [];
  });
  if (moved.length === 0) {
    return undefined;
  }
  const result = moved.reduce<Token[]>(
    (stream, token) => appendConjunct(stream, token).tokens,
    joinConjuncts(kept),
  );
  return { tokens: result, moved, hadOr };
}

/** Parses with every filter on one stage: the structure alone, not the stage rule. */
function isComplete(tokens: readonly Token[], stageIndex: number): boolean {
  return parseTokens(
    tokens.map((token) =>
      token.type === "filter" ? { ...token, stageIndex } : token,
    ),
  ).ok;
}

/** Drops an operand with the operator beside it, then tidies what is left. */
function removeOperand(sequence: Token[], token: Token): Token[] {
  const index = sequence.indexOf(token);
  if (index === -1) {
    return sequence;
  }
  const next = sequence.filter((_, i) => i !== index);
  if (next[index - 1]?.type === "op") {
    next.splice(index - 1, 1);
  } else if (next[index]?.type === "op") {
    next.splice(index, 1);
  }
  return tidyParens(next);
}

/** Removes empty parentheses and unwraps a lone filter, until nothing changes. */
function tidyParens(sequence: Token[]): Token[] {
  let result = sequence;
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < result.length - 1; index++) {
      if (isOpen(result[index]) && isClose(result[index + 1])) {
        result = [...result.slice(0, index), ...result.slice(index + 2)];
        changed = true;
        break;
      }
      if (
        isOpen(result[index]) &&
        isFilter(result[index + 1]) &&
        isClose(result[index + 2])
      ) {
        result = [
          ...result.slice(0, index),
          result[index + 1],
          ...result.slice(index + 3),
        ];
        changed = true;
        break;
      }
    }
  }
  return result;
}

/**
 * Which tokens of `next` are not in `previous`, matched by key: the
 * parentheses a relocation added, the `and` it supplied.
 */
export function freshIndexes(
  previous: readonly Token[],
  next: readonly Token[],
  keyOf: KeyOf,
): Set<number> {
  const unmatched = new Map<string, number>();
  previous.forEach((token) => {
    const key = keyOf(token);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  });
  const fresh = new Set<number>();
  next.forEach((token, index) => {
    const key = keyOf(token);
    const remaining = unmatched.get(key) ?? 0;
    if (remaining > 0) {
      unmatched.set(key, remaining - 1);
    } else {
      fresh.add(index);
    }
  });
  return fresh;
}
