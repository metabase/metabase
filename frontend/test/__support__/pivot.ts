import _ from "underscore";

import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

export const PIVOT_GROUPING_COLUMN = createMockColumn({
  name: "pivot-grouping",
  display_name: "pivot-grouping",
  source: "breakout",
  field_ref: ["expression", "pivot-grouping"],
  base_type: "type/Integer",
  effective_type: "type/Integer",
});

export type PivotOptions = {
  pivot_rows?: number[];
  pivot_cols?: number[];
  show_row_totals?: boolean;
  show_column_totals?: boolean;
};

type CreateMockPivotDataOpts = PivotOptions & {
  /** Breakout columns, in query order. */
  breakouts: DatasetColumn[];
  /** Aggregation columns. Their subtotals are sums, so use count or sum. */
  aggregations: DatasetColumn[];
  /** Detail rows: one value per breakout, then one per aggregation. */
  rows: RowValues[];
};

/**
 * Builds the result of a pivot query the way the backend does in
 * `metabase.query-processor.pivot.common/breakout-combinations`: one set of
 * rows for each breakout combination it computes, tagged with a
 * `pivot-grouping` bitmask in which bit `i` is set when breakout `i` is left
 * out. Without `pivot_rows` and `pivot_cols` it computes every combination,
 * as the backend does for public and embedded queries.
 */
export function createMockPivotData({
  breakouts,
  aggregations,
  rows,
  pivot_rows = [],
  pivot_cols = [],
  show_row_totals = true,
  show_column_totals = true,
}: CreateMockPivotDataOpts) {
  const breakoutCount = breakouts.length;
  const combinations = getBreakoutCombinations(breakoutCount, {
    pivot_rows,
    pivot_cols,
    show_row_totals,
    show_column_totals,
  });

  const pivotRows = combinations.flatMap((combination) => {
    const grouping = getGroupBitmask(breakoutCount, combination);
    const groups = _.groupBy(rows, (row) =>
      JSON.stringify(combination.map((index) => row[index])),
    );

    return Object.values(groups).map((groupRows) => {
      const breakoutValues: RowValue[] = _.range(breakoutCount).map((index) =>
        combination.includes(index) ? groupRows[0][index] : null,
      );
      const aggregationValues = aggregations.map((_column, index) =>
        groupRows.reduce(
          (sum, row) => sum + Number(row[breakoutCount + index]),
          0,
        ),
      );
      return [...breakoutValues, grouping, ...aggregationValues];
    });
  });

  return {
    cols: [...breakouts, PIVOT_GROUPING_COLUMN, ...aggregations],
    rows: pivotRows,
  };
}

function getGroupBitmask(breakoutCount: number, combination: number[]) {
  return _.range(breakoutCount).reduce(
    (bitmask, index) =>
      combination.includes(index) ? bitmask : bitmask | (1 << index),
    0,
  );
}

function getBreakoutCombinations(
  breakoutCount: number,
  {
    pivot_rows,
    pivot_cols,
    show_row_totals,
    show_column_totals,
  }: Required<PivotOptions>,
): number[][] {
  const all = _.range(breakoutCount);
  const combinations: number[][] =
    pivot_rows.length + pivot_cols.length === 0
      ? getPowerset(all)
      : [
          all,
          ...(show_column_totals
            ? _.range(1, pivot_rows.length).map((i) => [
                ...pivot_rows.slice(0, i),
                ...pivot_cols,
              ])
            : []),
          ...(show_row_totals ? [pivot_rows] : []),
          ...(show_row_totals && show_column_totals
            ? _.range(1, pivot_rows.length).map((i) => pivot_rows.slice(0, i))
            : []),
          ...(show_column_totals ? [pivot_cols] : []),
          ...(show_row_totals && show_column_totals ? [[]] : []),
        ];

  const sorted = combinations.map((combination) =>
    [...combination].sort((a, b) => a - b),
  );
  return _.sortBy(
    _.uniq(sorted, (combination) =>
      getGroupBitmask(breakoutCount, combination),
    ),
    (combination) => getGroupBitmask(breakoutCount, combination),
  );
}

function getPowerset(items: number[]): number[][] {
  return items.reduce<number[][]>(
    (subsets, item) => [
      ...subsets,
      ...subsets.map((subset) => [...subset, item]),
    ],
    [[]],
  );
}
