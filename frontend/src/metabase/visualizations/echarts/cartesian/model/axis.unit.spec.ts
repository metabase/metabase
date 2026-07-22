import dayjs from "dayjs";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { RowValue } from "metabase-types/api";
import {
  createMockDatetimeColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import {
  computeSplit,
  getXAxisDateRangeFromSortedXAxisValues,
  getXAxisModel,
} from "./axis";
import type { DimensionModel, SeriesExtents } from "./types";

describe("computeSplit", () => {
  const extents: SeriesExtents = {
    "1": [6, 8],
    "2": [9, 13],
    "3": [6, 7],
    "4": [1, 1],
    "5": [10, 13],
    "6": [15, 19],
    "7": [5, 6],
    "8": [5, 10],
    "9": [9, 13],
    "10": [2, 6],
    "11": [12, 15],
    "12": [1, 1],
  };

  it("should return the same number of series as given", () => {
    expect(computeSplit(extents).flat()).toHaveLength(
      Object.keys(extents).length,
    );
  });

  it("should not isolate a constant (zero-range) series and force dissimilar series onto the same axis (#36908)", () => {
    const extentsWithZeroRange: SeriesExtents = {
      count: [50, 600],
      zeroes: [0, 0],
      tax: [3, 7],
    };

    const [left, right] = computeSplit(extentsWithZeroRange);
    const onSameAxis = (a: string, b: string) =>
      (left.includes(a) && left.includes(b)) ||
      (right.includes(a) && right.includes(b));

    // The dissimilar large/small ranges must be split across axes, otherwise the
    // small-range series gets squashed flat against the axis.
    expect(onSameAxis("count", "tax")).toBe(false);

    // The constant series must not be isolated on its own axis — it should share
    // with another series instead of driving the split.
    expect(
      left.includes("zeroes") ? left.length : right.length,
    ).toBeGreaterThan(1);
  });
});

describe("getXAxisModel", () => {
  it("should format untagged datetime values using the inferred temporal unit for ordinal scale (#68179)", () => {
    const dateColumn = createMockDatetimeColumn({ unit: undefined });

    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
    };

    const dataset = [
      { [X_AXIS_DATA_KEY]: "2022-01-01T00:00:00Z", "0": 10 },
      { [X_AXIS_DATA_KEY]: "2022-02-01T00:00:00Z", "0": 20 },
      { [X_AXIS_DATA_KEY]: "2022-03-01T00:00:00Z", "0": 30 },
      { [X_AXIS_DATA_KEY]: "2022-04-01T00:00:00Z", "0": 40 },
    ];

    const rawSeries = [createMockSingleSeries({ display: "line" })];

    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "ordinal",
    });

    const model = getXAxisModel(dimensionModel, rawSeries, dataset, settings);

    expect(model.formatter("2022-04-01T00:00:00Z")).toBe("April 2022");
  });
});

describe("getXAxisDateRangeFromSortedXAxisValues", () => {
  it("should not consider undefined values for the range", () => {
    // Undefined values appear when two timeseries datasets are combined (#64921)
    const range = getXAxisDateRangeFromSortedXAxisValues([
      "2022-03-01T00:00:00Z",
      "2022-04-01T00:00:00Z",
      undefined,
    ] as RowValue[]);
    expect(range).toStrictEqual([
      dayjs.utc("2022-03-01T00:00:00Z"),
      dayjs.utc("2022-04-01T00:00:00Z"),
    ]);
  });
});
