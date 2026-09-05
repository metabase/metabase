import { color } from "metabase/ui/colors/palette";
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
      { source: "breakout", name: "error_type" },
      { source: "aggregation", name: "count" },
    ],
    rows,
  },
});

const rowsOf = (series: ReturnType<typeof toCountBreakoutRawSeries>) =>
  series?.[0].data.rows;

const pieColorsOf = (series: ReturnType<typeof toCountBreakoutRawSeries>) => {
  const settings = series?.[0].card.visualization_settings;
  return settings && "pie.colors" in settings
    ? settings["pie.colors"]
    : undefined;
};

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

describe("toCountBreakoutRawSeries error pie coloring", () => {
  it("never assigns the success-green accent to a pie slice when errorsOnly is set", () => {
    const series = toCountBreakoutRawSeries(
      response([
        ["timeout", 10],
        ["validation_error", 7],
        ["rate_limit", 5],
      ]),
      jsQuery,
      { ...opts, display: "pie", errorsOnly: true },
    );

    expect(Object.values(pieColorsOf(series) ?? {})).not.toContain(
      color("accent1"),
    );
  });

  it("leaves pie coloring to the default palette when errorsOnly is not set", () => {
    const series = toCountBreakoutRawSeries(
      response([
        ["tool_a", 10],
        ["tool_b", 7],
      ]),
      jsQuery,
      { ...opts, display: "pie" },
    );

    expect(pieColorsOf(series)).toBeUndefined();
  });
});
