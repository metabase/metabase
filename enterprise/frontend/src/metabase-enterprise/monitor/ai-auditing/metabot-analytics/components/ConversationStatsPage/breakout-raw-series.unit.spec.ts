import type { DatasetQuery } from "metabase-types/api";

import {
  mapBreakoutDimension,
  toBreakoutRawSeries,
} from "./breakout-raw-series";

// Unjustified type cast. FIXME
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

const withModelSeries = (rows: unknown[][]) => ({
  data: {
    cols: [
      { source: "breakout", name: "group_name" },
      { source: "breakout", name: "model" },
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

  it("ranks categories by their total across models, not by a single model's share", () => {
    // B wins on total (7) despite A having the single largest bar (5).
    const out = toBreakoutRawSeries(
      withModelSeries([
        ["A", "opus", 5],
        ["B", "opus", 4],
        ["B", "gpt", 3],
        ["C", "opus", 1],
      ]),
      jsQuery,
      { ...baseOpts, maxCategories: 3 },
    );
    expect(out?.[0].data.rows).toEqual([
      ["B", "opus", 4],
      ["B", "gpt", 3],
      ["A", "opus", 5],
      ["C", "opus", 1],
    ]);
  });

  it("keeps the model split inside the Other bucket", () => {
    const out = toBreakoutRawSeries(
      withModelSeries([
        ["A", "opus", 10],
        ["B", "opus", 9],
        ["C", "opus", 2],
        ["C", "gpt", 1],
        ["D", "gpt", 3],
      ]),
      jsQuery,
      { ...baseOpts, maxCategories: 3 },
    );
    expect(out?.[0].data.rows).toEqual([
      ["A", "opus", 10],
      ["B", "opus", 9],
      ["Other", "opus", 2],
      ["Other", "gpt", 1 + 3],
    ]);
  });

  it("stacks and pairs both breakouts as dimensions when a model series is present", () => {
    const out = toBreakoutRawSeries(
      withModelSeries([["A", "opus", 1]]),
      jsQuery,
      baseOpts,
    );
    const settings = out?.[0].card.visualization_settings;
    expect(settings?.["graph.dimensions"]).toEqual(["group_name", "model"]);
    expect(settings?.["stackable.stack_type"]).toBe("stacked");
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

  it("targets the second breakout when asked for the series dimension", () => {
    const out = mapBreakoutDimension(
      withModelSeries([["A", null, 3]]),
      (v) => (v == null ? "Unknown model" : v),
      "series",
    );
    expect(out?.data?.rows).toEqual([["A", "Unknown model", 3]]);
  });

  it("leaves rows alone when asked for a series dimension that is not there", () => {
    const out = mapBreakoutDimension(response([["A", 3]]), () => "x", "series");
    expect(out?.data?.rows).toEqual([["A", 3]]);
  });
});
