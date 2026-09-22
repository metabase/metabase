import { createMockSeriesModel } from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import { checkNotNull } from "metabase/utils/types";
import type {
  DatasetColumn,
  RowValue,
  SeriesSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatetimeColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import type { ComputedVisualizationSettings } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";

import {
  computeSplit,
  getXAxisDateRangeFromSortedXAxisValues,
  getXAxisModel,
  getYAxesModels,
} from "./axis";
import { isTimeSeriesAxis } from "./guards";
import type {
  ChartDataset,
  DataKey,
  DimensionModel,
  LegacySeriesSettingsObjectKey,
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

describe("getYAxesModels", () => {
  const LEFT_SERIES_KEY = "revenue";
  const RIGHT_SERIES_KEY = "orders";

  const seriesModels = [
    createMockSeriesModel({ dataKey: LEFT_SERIES_KEY }),
    createMockSeriesModel({ dataKey: RIGHT_SERIES_KEY }),
  ];

  const dataset: ChartDataset = [
    { [X_AXIS_DATA_KEY]: "Jan", [LEFT_SERIES_KEY]: 1, [RIGHT_SERIES_KEY]: 900 },
    {
      [X_AXIS_DATA_KEY]: "Feb",
      [LEFT_SERIES_KEY]: 2,
      [RIGHT_SERIES_KEY]: 1000,
    },
  ];

  const columnByDataKey: Record<DataKey, DatasetColumn> = {
    [LEFT_SERIES_KEY]: createMockColumn({ name: LEFT_SERIES_KEY }),
    [RIGHT_SERIES_KEY]: createMockColumn({ name: RIGHT_SERIES_KEY }),
  };

  const assignSeriesToAxis = ({
    card,
  }: LegacySeriesSettingsObjectKey): SeriesSettings =>
    card._seriesKey === RIGHT_SERIES_KEY ? { axis: "right" } : { axis: "left" };

  const getSplitAxesModels = (settings: ComputedVisualizationSettings) =>
    getYAxesModels(
      seriesModels,
      dataset,
      dataset,
      { series: assignSeriesToAxis, ...settings },
      columnByDataKey,
      true,
      [],
      false,
    );

  it("should label both axes with the legacy 'graph.y_axis.title_text' when no right-axis label is stored", () => {
    // Deleting this test lets saved split-axis questions silently lose their
    // right-axis label, which used to come from the single shared key.
    const { leftAxisModel, rightAxisModel } = getSplitAxesModels({
      "graph.y_axis.title_text": "Legacy label",
    });

    expect(checkNotNull(leftAxisModel).label).toBe("Legacy label");
    expect(checkNotNull(rightAxisModel).label).toBe("Legacy label");
  });

  it("should fall back to the left label when the right one is cleared to blank", () => {
    const { leftAxisModel, rightAxisModel } = getSplitAxesModels({
      "graph.y_axis.title_text": "Orders placed",
      "graph.y_axis.right.title_text": "",
    });

    expect(checkNotNull(leftAxisModel).label).toBe("Orders placed");
    expect(checkNotNull(rightAxisModel).label).toBe("Orders placed");
  });

  it("should label each axis from its own setting when both are stored", () => {
    const { leftAxisModel, rightAxisModel } = getSplitAxesModels({
      "graph.y_axis.title_text": "Revenue",
      "graph.y_axis.right.title_text": "Orders",
    });

    expect(checkNotNull(leftAxisModel).label).toBe("Revenue");
    expect(checkNotNull(rightAxisModel).label).toBe("Orders");
  });

  it("should suppress both labels when 'graph.y_axis.labels_enabled' is false", () => {
    const { leftAxisModel, rightAxisModel } = getSplitAxesModels({
      "graph.y_axis.labels_enabled": false,
      "graph.y_axis.title_text": "Revenue",
      "graph.y_axis.right.title_text": "Orders",
    });

    expect(checkNotNull(leftAxisModel).label).toBeUndefined();
    expect(checkNotNull(rightAxisModel).label).toBeUndefined();
  });
});
