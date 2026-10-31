import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";
import type { Token } from "../expression-bar-2/tokens";
import { withSumOfTotalByMonth } from "../expression-bar-drill/QuestionView";

const STAGE_INDEX = 0;

/** Pretend round-trip to the LLM, so the pill visibly "thinks". */
export const FAKE_LLM_DELAY_MS = 1100;

export type Summary = {
  id: number;
  tokens: Token[];
  /** Undefined while Metabot is "generating" it. */
  label?: string;
  isExpanded?: boolean;
};

export type TokenRange = { start: number; end: number };

/**
 * Sum of Total by month with a realistic pile of filters, enough to wrap:
 * a date range, three on the product, two on the customer, and an OR group
 * plus a threshold on the order itself.
 */
export function withManyFiltersByMonth(query: Lib.Query): Lib.Query {
  const base = withSumOfTotalByMonth(query);
  return [...getBaseClauses(base), ...getOrderClauses(base)].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, STAGE_INDEX, clause),
    clearFilters(base, STAGE_INDEX),
  );
}

// Built once from the starting query, where the column lookup is known to
// work, then replayed onto whatever the bar holds when Metabot "answers".
let metabotClauses: Lib.ExpressionClause[] = [];

/**
 * The same question without the order filters: those are what Metabot
 * "generates" from the canned prompt.
 */
export function withFiltersForMetabot(query: Lib.Query): Lib.Query {
  const base = withSumOfTotalByMonth(query);
  metabotClauses = getOrderClauses(base);
  return getBaseClauses(base).reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, STAGE_INDEX, clause),
    clearFilters(base, STAGE_INDEX),
  );
}

export const CANNED_METABOT_PROMPT = () =>
  t`Only orders over $50 that were either discounted or had 3 or more items`;

/** What Metabot "generates" from the canned prompt, AND-ed onto the bar. */
export function withMetabotFilters(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return metabotClauses.reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    query,
  );
}

function findColumn(query: Lib.Query, displayName: string) {
  return Lib.filterableColumns(query, STAGE_INDEX).find(
    (column) =>
      Lib.displayInfo(query, STAGE_INDEX, column).displayName === displayName,
  );
}

function getBaseClauses(query: Lib.Query): Lib.ExpressionClause[] {
  const createdAt = findColumn(query, "Created At");
  const category = findColumn(query, "Category");
  const rating = findColumn(query, "Rating");
  const price = findColumn(query, "Price");
  const state = findColumn(query, "State");
  const source = findColumn(query, "Source");
  if (!createdAt || !category || !rating || !price || !state || !source) {
    return [];
  }
  return [
    Lib.relativeDateFilterClause({
      column: createdAt,
      value: -2,
      unit: "year",
      offsetValue: null,
      offsetUnit: null,
      options: {},
    }),
    Lib.stringFilterClause({
      operator: "=",
      column: category,
      values: ["Gadget", "Widget"],
      options: {},
    }),
    Lib.numberFilterClause({ operator: ">=", column: rating, values: [4] }),
    Lib.numberFilterClause({
      operator: "between",
      column: price,
      values: [20, 80],
    }),
    Lib.stringFilterClause({
      operator: "=",
      column: state,
      values: ["CA", "NY", "TX", "WA"],
      options: {},
    }),
    Lib.stringFilterClause({
      operator: "=",
      column: source,
      values: ["Google", "Facebook"],
      options: {},
    }),
  ];
}

function getOrderClauses(query: Lib.Query): Lib.ExpressionClause[] {
  const discount = findColumn(query, "Discount");
  const quantity = findColumn(query, "Quantity");
  const subtotal = findColumn(query, "Subtotal");
  if (!discount || !quantity || !subtotal) {
    return [];
  }
  return [
    Lib.expressionClause("or", [
      Lib.defaultFilterClause({ operator: "not-null", column: discount }),
      Lib.numberFilterClause({ operator: ">=", column: quantity, values: [3] }),
    ]),
    Lib.numberFilterClause({ operator: ">=", column: subtotal, values: [50] }),
  ];
}

type Topic = "date" | "product" | "customer" | "order";

const TOPIC_LABELS: Record<Topic, { long: () => string; short: () => string }> =
  {
    date: { long: () => t`Last 2 years`, short: () => t`Last 2 years` },
    product: {
      long: () => t`Top-rated gadgets & widgets, $20–80`,
      short: () => t`Top gadgets & widgets`,
    },
    customer: {
      long: () => t`Google & Facebook signups in 4 states`,
      short: () => t`Google & FB signups`,
    },
    order: {
      long: () => t`Discounted or bulk orders over $50`,
      short: () => t`Discounted or bulk orders`,
    },
  };

function getTopic(label: string): Topic {
  if (label.startsWith("Product")) {
    return "product";
  }
  if (label.startsWith("User")) {
    return "customer";
  }
  if (label.startsWith("Created At")) {
    return "date";
  }
  return "order";
}

function getTopics(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
): Topic[] {
  const topics = tokens.flatMap((token) =>
    token.type === "filter"
      ? [getTopic(getFilterLabel(query, stageIndex, token.clause))]
      : [],
  );
  return [...new Set(topics)];
}

/** The canned "LLM" output: a phrase per topic the selection touches. */
export function generateSummaryLabel(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
): string {
  const topics = getTopics(query, stageIndex, tokens);
  if (topics.length === 1) {
    return TOPIC_LABELS[topics[0]].long();
  }
  if (topics.length === 2) {
    return topics.map((topic) => TOPIC_LABELS[topic].short()).join(" · ");
  }
  return t`Recent top-rated gadget & widget orders from key customers`;
}

export function countFilters(tokens: Token[]): number {
  return tokens.filter((token) => token.type === "filter").length;
}

function getParenMatches(tokens: Token[]): (number | undefined)[] {
  const matches: (number | undefined)[] = tokens.map(() => undefined);
  const stack: number[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== "paren") {
      return;
    }
    if (token.side === "open") {
      stack.push(index);
      return;
    }
    const open = stack.pop();
    if (open != null) {
      matches[open] = index;
      matches[index] = open;
    }
  });
  return matches;
}

/**
 * Snaps a dragged range to something that reads as one expression: whole
 * parenthesised groups, no dangling `and` / `or` at either end.
 */
export function normalizeRange(
  tokens: Token[],
  { start, end }: TokenRange,
): TokenRange {
  const matches = getParenMatches(tokens);
  let range = { start, end };
  let previous: TokenRange;
  do {
    previous = range;
    const indexes = matches
      .slice(range.start, range.end + 1)
      .filter((match): match is number => match != null);
    range = {
      start: Math.min(range.start, ...indexes),
      end: Math.max(range.end, ...indexes),
    };
  } while (previous.start !== range.start || previous.end !== range.end);

  while (range.start < range.end && tokens[range.start].type === "op") {
    range = { ...range, start: range.start + 1 };
  }
  while (range.end > range.start && tokens[range.end].type === "op") {
    range = { ...range, end: range.end - 1 };
  }
  return range;
}

/**
 * The automatic grouping: split the top level on `and`, then merge runs of
 * neighbouring operands about the same topic. Runs holding a single filter
 * stay as they are; a top-level OR is one operand, so it becomes one summary.
 */
export function getAutoRanges(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
): TokenRange[] {
  let depth = 0;
  const operands: TokenRange[] = [];
  let start = 0;
  const hasTopLevelOr = tokens.some((token, index) => {
    const isOr = depth === 0 && token.type === "op" && token.op === "or";
    if (token.type === "paren") {
      depth += token.side === "open" ? 1 : -1;
    }
    if (depth === 0 && token.type === "op" && token.op === "and") {
      operands.push({ start, end: index - 1 });
      start = index + 1;
    }
    return isOr;
  });
  if (hasTopLevelOr) {
    return [{ start: 0, end: tokens.length - 1 }];
  }
  operands.push({ start, end: tokens.length - 1 });

  const topicOf = (range: TokenRange) =>
    getTopics(query, stageIndex, tokens.slice(range.start, range.end + 1)).join(
      "+",
    );
  const runs = operands.reduce<{ topic: string; range: TokenRange }[]>(
    (runs, operand) => {
      const topic = topicOf(operand);
      const last = runs.at(-1);
      if (last && last.topic === topic) {
        last.range = { ...last.range, end: operand.end };
        return runs;
      }
      return [...runs, { topic, range: operand }];
    },
    [],
  );
  return runs
    .map((run) => run.range)
    .filter(
      (range) => countFilters(tokens.slice(range.start, range.end + 1)) > 1,
    );
}
