import { dayjs } from "metabase/dayjs";
import type { RowValue } from "metabase-types/api";
import {
  createMockDatetimeColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { X_AXIS_DATA_KEY } from "../constants/dataset";

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
} from "./types";

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
      columns: [dateColumn],
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

  describe("timeseries toEChartsAxisValue", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "hour" });

    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
      columns: [dateColumn],
    };

    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });

    const getTimeSeriesModel = (resultsTimezone: string) => {
      const dataset = [
        { [X_AXIS_DATA_KEY]: "2025-03-30 00:00:00", "0": 10 },
        { [X_AXIS_DATA_KEY]: "2025-03-30 01:00:00", "0": 11 },
      ];
      const rawSeries = [
        createMockSingleSeries(
          { display: "line" },
          { data: { results_timezone: resultsTimezone } },
        ),
      ];
      // graph.x_axis.scale is timeseries, so the model should be a TimeSeriesXAxisModel
      const model = getXAxisModel(
        dimensionModel,
        rawSeries,
        dataset,
        settings,
      ) as TimeSeriesXAxisModel;
      expect(isTimeSeriesAxis(model)).toBe(true);
      return model;
    };

    it("should preserve timezone-naive datetime wall clock as fake UTC under a named results_timezone (#56580)", () => {
      const model = getTimeSeriesModel("US/Samoa");
      expect(model.toEChartsAxisValue("2025-03-30 00:00:00")).toBe(
        "2025-03-30T00:00:00Z",
      );
    });

    it("should preserve timezone-naive date-only wall clock as fake UTC under a named results_timezone (#56580)", () => {
      const model = getTimeSeriesModel("US/Samoa");
      expect(model.toEChartsAxisValue("2025-04-01")).toBe(
        "2025-04-01T00:00:00Z",
      );
    });

    it("should preserve timezone-naive wall clock under an offset results_timezone (#56580)", () => {
      const model = getTimeSeriesModel("+08:00");
      expect(model.toEChartsAxisValue("2025-03-30 00:00:00")).toBe(
        "2025-03-30T08:00:00+08:00",
      );
    });

    it("should still shift timezone-aware values into fake UTC using a named results_timezone", () => {
      const model = getTimeSeriesModel("US/Mountain");
      expect(model.toEChartsAxisValue("2025-03-30T00:00:00-06:00")).toBe(
        "2025-03-30T00:00:00Z",
      );
    });

    it("should still shift timezone-aware values when results_timezone is an offset", () => {
      const model = getTimeSeriesModel("+08:00");
      expect(model.toEChartsAxisValue("2025-03-30T00:00:00+08:00")).toBe(
        "2025-03-30T08:00:00+08:00",
      );
    });
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
