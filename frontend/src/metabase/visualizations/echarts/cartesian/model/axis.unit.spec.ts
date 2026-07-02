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
import { isTimeSeriesAxis } from "./guards";
import type {
  DimensionModel,
  SeriesExtents,
  TimeSeriesXAxisModel,
  XAxisModel,
} from "./types";

function expectTimeSeriesAxis(
  model: XAxisModel,
): asserts model is TimeSeriesXAxisModel {
  expect(isTimeSeriesAxis(model)).toBe(true);
}

function expectNonNull<T>(value: T): asserts value is Exclude<T, null> {
  expect(value).not.toBeNull();
}

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
  it("should decode timezone-shifted ECharts values before formatting x-axis labels (#55966)", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "hour" });
    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
    };
    const dataset = [
      { [X_AXIS_DATA_KEY]: "2025-03-30 00:00:00", count: 10 },
      { [X_AXIS_DATA_KEY]: "2025-03-30 01:00:00", count: 11 },
    ];
    const rawSeries = [
      createMockSingleSeries(
        { display: "line" },
        {
          data: {
            requested_timezone: "US/Mountain",
            results_timezone: "US/Mountain",
          },
        },
      ),
    ];
    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });

    const model = getXAxisModel(dimensionModel, rawSeries, dataset, settings);

    expectTimeSeriesAxis(model);

    const echartsValue = model.toEChartsAxisValue("2025-03-30 01:00:00");
    expectNonNull(echartsValue);

    expect(echartsValue).toBe("2025-03-29T19:00:00Z");
    expect(
      model
        .fromEChartsAxisValue(dayjs.utc(echartsValue).valueOf())
        .format("YYYY-MM-DDTHH:mm:ss[Z]"),
    ).toBe("2025-03-30T01:00:00Z");
  });

  it("should not decode calendar bucket ECharts values into the previous bucket", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "month" });
    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
    };
    const dataset = [
      { [X_AXIS_DATA_KEY]: "2022-09-01T00:00:00+01:00", count: 10 },
      { [X_AXIS_DATA_KEY]: "2022-10-01T00:00:00+01:00", count: 11 },
    ];
    const rawSeries = [
      createMockSingleSeries(
        { display: "bar" },
        {
          data: {
            requested_timezone: "Europe/Lisbon",
            results_timezone: "Europe/Lisbon",
          },
        },
      ),
    ];
    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });

    const model = getXAxisModel(dimensionModel, rawSeries, dataset, settings);

    expectTimeSeriesAxis(model);

    const echartsValue = model.toEChartsAxisValue("2022-09-01T00:00:00+01:00");
    expectNonNull(echartsValue);

    expect(echartsValue).toBe("2022-09-01T00:00:00Z");
    expect(
      model
        .fromEChartsAxisValue(dayjs.utc(echartsValue).valueOf())
        .format("YYYY-MM-DDTHH:mm:ss[Z]"),
    ).toBe("2022-09-01T00:00:00Z");
  });

  it("should not decode offset-based ECharts values into UTC clock time", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "hour" });
    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
    };
    const dataset = [
      { [X_AXIS_DATA_KEY]: "2024-09-01T00:00:00+13:00", count: 10 },
      { [X_AXIS_DATA_KEY]: "2024-09-01T01:00:00+13:00", count: 11 },
    ];
    const rawSeries = [
      createMockSingleSeries(
        { display: "bar" },
        {
          data: {
            requested_timezone: "+13:00",
            results_timezone: "+13:00",
          },
        },
      ),
    ];
    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });

    const model = getXAxisModel(dimensionModel, rawSeries, dataset, settings);

    expectTimeSeriesAxis(model);

    const echartsValue = model.toEChartsAxisValue("2024-09-01T00:00:00+13:00");
    expectNonNull(echartsValue);

    expect(
      model
        .fromEChartsAxisValue(dayjs.utc(echartsValue).valueOf())
        .format("YYYY-MM-DDTHH:mm:ss[Z]"),
    ).toBe("2024-09-01T00:00:00Z");
  });

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
