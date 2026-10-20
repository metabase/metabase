import _ from "underscore";

import type { Counts, GroupCounts, InsightCondition } from "./types";

/** The counts from both passes, looked up by transition and conditions. */
export type CountIndex = {
  /** Transition numbers, ascending. */
  transitions: number[];
  /** Everyone at each transition. */
  totals: ReadonlyMap<number, Counts>;
  /** Every group with at least one condition. */
  groups: readonly GroupCounts[];
  /** The attributes the singles query grouped by, most preferred first. */
  singleAttributes: readonly string[];
  /**
   * Conditions are matched in any order. A group the queries covered but
   * returned no row for has no people; one they didn't cover is undefined.
   */
  get: (
    transition: number,
    conditions: readonly InsightCondition[],
  ) => Counts | undefined;
};

type IndexCountsArgs = {
  rows: readonly GroupCounts[];
  /** The attributes the singles query grouped by. */
  singleAttributes: readonly string[];
  /** The values the pairs query kept for each attribute. */
  pairValues?: ReadonlyMap<string, readonly string[]>;
};

const NO_PEOPLE: Counts = { reached: 0, converted: 0 };

const groupKey = (
  transition: number,
  conditions: readonly InsightCondition[],
): string =>
  JSON.stringify([
    transition,
    _.sortBy(
      conditions.map(({ attributeId, value }) => [attributeId, value]),
      ([attributeId]) => attributeId,
    ),
  ]);

export const indexCounts = ({
  rows,
  singleAttributes,
  pairValues = new Map(),
}: IndexCountsArgs): CountIndex => {
  const byKey = new Map(
    rows.map((row) => [groupKey(row.transition, row.conditions), row]),
  );
  const totals = new Map(
    rows
      .filter((row) => row.conditions.length === 0)
      .map((row) => [row.transition, row]),
  );
  const isCovered = (conditions: readonly InsightCondition[]): boolean => {
    if (conditions.length === 1) {
      return singleAttributes.includes(conditions[0].attributeId);
    }
    const isDistinctPair =
      conditions.length === 2 &&
      conditions[0].attributeId !== conditions[1].attributeId;
    return (
      isDistinctPair &&
      conditions.every(
        ({ attributeId, value }) =>
          pairValues.get(attributeId)?.includes(value) ?? false,
      )
    );
  };

  return {
    transitions: [...totals.keys()].sort((a, b) => a - b),
    totals,
    groups: rows.filter((row) => row.conditions.length > 0),
    singleAttributes,
    get: (transition, conditions) => {
      if (conditions.length === 0) {
        return totals.get(transition);
      }
      const row = byKey.get(groupKey(transition, conditions));
      if (row !== undefined) {
        return row;
      }
      return totals.has(transition) && isCovered(conditions)
        ? NO_PEOPLE
        : undefined;
    },
  };
};
