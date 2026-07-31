import type { DatasetQuery } from "metabase-types/api";

import { toCountBreakoutRawSeries } from "./raw-series";

// Unjustified type cast. FIXME
const jsQuery = { database: 1, type: "query", query: {} } as DatasetQuery;

const opts = {
  display: "row" as const,
  otherLabel: "Other",
  getColor: () => "#509EE3",
};

/** A single-breakout count response: one `breakout` dimension col + one `aggregation` metric col. */
const response = (rows: unknown[][]) => ({
  data: {
    cols: [
      { source: "breakout", name: "client_display_name" },
      { source: "aggregation", name: "count" },
    ],
    rows,
  },
});

const rowsOf = (series: ReturnType<typeof toCountBreakoutRawSeries>) =>
  series?.[0].data.rows;

describe("toCountBreakoutRawSeries collapse behavior", () => {
  it("folds the long tail into a single summed 'Other' row when rows exceed maxCategories", () => {
    const series = toCountBreakoutRawSeries(
      response([
        ["A", 10],
        ["B", 7],
        ["C", 5],
        ["D", 3],
        ["E", 1],
      ]),
      jsQuery,
      { ...opts, maxCategories: 3 },
    );

    // keep top (max - 1) = 2, fold the remaining 3 into "Other" summing 5 + 3 + 1 = 9
    expect(rowsOf(series)).toEqual([
      ["A", 10],
      ["B", 7],
      ["Other", 9],
    ]);
  });

  it("leaves rows untouched when the count is within maxCategories", () => {
    const rows = [
      ["A", 10],
      ["B", 7],
    ];
    const series = toCountBreakoutRawSeries(response(rows), jsQuery, {
      ...opts,
      maxCategories: 3,
    });
    expect(rowsOf(series)).toEqual(rows);
  });

  it("leaves rows untouched when maxCategories is unset", () => {
    const rows = [
      ["A", 10],
      ["B", 7],
      ["C", 5],
    ];
    const series = toCountBreakoutRawSeries(response(rows), jsQuery, opts);
    expect(rowsOf(series)).toEqual(rows);
  });

  it("returns null without data or query", () => {
    expect(toCountBreakoutRawSeries(undefined, jsQuery, opts)).toBeNull();
    expect(
      toCountBreakoutRawSeries(response([["A", 1]]), null, opts),
    ).toBeNull();
  });
});
