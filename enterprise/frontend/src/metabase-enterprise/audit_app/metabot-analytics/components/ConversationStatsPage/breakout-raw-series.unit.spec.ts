import type { DatasetQuery } from "metabase-types/api";

import {
  mapBreakoutDimension,
  toBreakoutRawSeries,
} from "./breakout-raw-series";

const jsQuery = { database: 1, type: "query", query: {} } as DatasetQuery;

const response = (rows: unknown[][]) => ({
  data: {
    cols: [
      { source: "breakout", name: "group_name" },
      { source: "aggregation", name: "count" },
    ],
    rows,
  },
});

const baseOpts = {
  metric: "conversations" as const,
  display: "row" as const,
  otherLabel: "Other",
  getColor: (name: string) => `#${name}`,
};

describe("toBreakoutRawSeries", () => {
  it("returns null when response or jsQuery is missing", () => {
    expect(toBreakoutRawSeries(undefined, jsQuery, baseOpts)).toBeNull();
    expect(
      toBreakoutRawSeries(response([["A", 1]]), null, baseOpts),
    ).toBeNull();
  });

  it("collapses rows past maxCategories into an Other bucket that sums the overflow", () => {
    const out = toBreakoutRawSeries(
      response([
        ["A", 5],
        ["B", 4],
        ["C", 3],
        ["D", 2],
        ["E", 1],
      ]),
      jsQuery,
      { ...baseOpts, maxCategories: 3 },
    );
    expect(out?.[0].data.rows).toEqual([
      ["A", 5],
      ["B", 4],
      ["Other", 3 + 2 + 1],
    ]);
  });
});

describe("mapBreakoutDimension", () => {
  it("rewrites the breakout cell using the supplied function", () => {
    const out = mapBreakoutDimension(response([[null, 3]]), (v) =>
      v == null ? "Unknown" : v,
    );
    expect(out?.data?.rows).toEqual([["Unknown", 3]]);
  });

  it("returns the response unchanged when there is no data", () => {
    expect(mapBreakoutDimension(undefined, (v) => v)).toBeUndefined();
  });
});
