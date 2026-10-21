import _ from "underscore";

import type { CountIndex } from "./counts";
import {
  DEFAULT_INSIGHT_OPTIONS,
  type InsightOptions,
  getMinGroupSize,
} from "./options";
import { evaluateGroup } from "./search";
import type { Insight } from "./types";

type PairColumn = {
  attributeId: string;
  values: string[];
  /** The largest |excess| among the attribute's single-attribute groups. */
  score: number;
  priority: number;
};

/** The most rows the pairs query can return for these columns. */
export const getPairRowBound = (
  valueCounts: readonly number[],
  questionCount: number,
): number => {
  const sum = valueCounts.reduce((total, count) => total + count, 0);
  const sumOfSquares = valueCounts.reduce(
    (total, count) => total + count * count,
    0,
  );
  return (questionCount * (sum * sum - sumOfSquares)) / 2;
};

const getPairColumn = (
  index: CountIndex,
  attributeId: string,
  priority: number,
  options: InsightOptions,
): PairColumn => {
  const groups = index.groups.filter(
    ({ conditions }) =>
      conditions.length === 1 && conditions[0].attributeId === attributeId,
  );
  // A pair is never bigger than either of its parents, so a value too small
  // on its own can't be part of a reportable pair.
  const largestByValue = new Map<string, number>();
  groups.forEach((group) => {
    const total = index.totals.get(group.question);
    const value = group.conditions[0].value;
    if (
      total !== undefined &&
      group.reached >= getMinGroupSize(total.reached, options)
    ) {
      largestByValue.set(
        value,
        Math.max(largestByValue.get(value) ?? 0, group.reached),
      );
    }
  });
  const values = _.sortBy([...largestByValue], ([, reached]) => -reached)
    .slice(0, options.maxValuesPerAttribute)
    .map(([value]) => value);
  const score = Math.max(
    0,
    ...groups.map((group) => {
      const total = index.totals.get(group.question);
      const insight =
        total !== undefined ? evaluateGroup(group, total, options) : null;
      return insight !== null ? Math.abs(insight.excess) : 0;
    }),
  );
  return { attributeId, values, score, priority };
};

/**
 * The attributes and values for the pairs query: the most promising
 * attributes from the singles counts, added while the most rows the query
 * could return stays within the budget. Empty when fewer than two fit.
 *
 * `attributeIds` is in priority order, used to break ties.
 */
export const planPairs = (
  index: CountIndex,
  attributeIds: readonly string[],
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): Map<string, string[]> => {
  const columns = attributeIds
    .map((attributeId, priority) =>
      getPairColumn(index, attributeId, priority, options),
    )
    .filter(({ values }) => values.length > 0)
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
  const chosen = columns.reduce<PairColumn[]>((picked, column) => {
    const bound = getPairRowBound(
      [...picked, column].map(({ values }) => values.length),
      index.questions.length,
    );
    return bound <= options.pairRowBudget ? [...picked, column] : picked;
  }, []);
  return chosen.length >= 2
    ? new Map(chosen.map(({ attributeId, values }) => [attributeId, values]))
    : new Map();
};

/**
 * The attributes and values for counting pairs of the single-attribute
 * insights found, so the search can tell when one accounts for another: each
 * attribute in an insight, with the values it has in them. Empty when fewer
 * than two attributes have one.
 */
export const planOverlapPairs = (
  singles: readonly Insight[],
): Map<string, string[]> => {
  const byAttribute = new Map<string, string[]>();
  singles.forEach(({ conditions }) =>
    conditions.forEach(({ attributeId, value }) => {
      const values = byAttribute.get(attributeId) ?? [];
      if (!values.includes(value)) {
        byAttribute.set(attributeId, [...values, value]);
      }
    }),
  );
  return byAttribute.size >= 2 ? byAttribute : new Map();
};
