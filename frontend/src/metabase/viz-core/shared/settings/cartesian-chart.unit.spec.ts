import type {
  DatasetData,
  RawSeries,
  VisualizationDisplay,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getBoxPlotModel } from "../../echarts/boxplot/model";
import { getCartesianChartModel } from "../../echarts/cartesian/model";
import type { LegacySeriesSettingsObjectKey } from "../../echarts/cartesian/model/types";
import { getScatterPlotModel } from "../../echarts/cartesian/scatter/model";
import type { RenderingContext } from "../../types";
import { DEFAULT_VISUALIZATION_THEME } from "../utils/theme";

import {
  getDefaultBoxplotDimensions,
  getDefaultColumns,
  getDefaultDimensions,
  getDefaultMetrics,
  getYAxisSides,
} from "./cartesian-chart";

const createSeries = ({
  display,
  cols,
  rows = [
    [1, "a", 10],
    [2, "b", 20],
  ],
}: {
  display: VisualizationDisplay;
  cols: DatasetData["cols"];
  rows?: DatasetData["rows"];
}) => {
  return [
    {
      card: createMockCard({ display }),
      data: createMockDatasetData({
        cols,
        rows,
      }),
    },
  ];
};

describe("cartesian-chart defaults", () => {
  it("ignores previous metrics that reference missing columns", () => {
    const cols = [
      createMockColumn({
        name: "created_at",
        display_name: "Created At",
        source: "breakout",
      }),
      createMockColumn({
        name: "sum",
        display_name: "Sum",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];
    const series = createSeries({ display: "bar", cols });

    const result = getDefaultMetrics(series, {
      "graph.metrics": ["missing_metric"],
    });

    expect(result).toEqual(["sum"]);
  });

  it("ignores previous dimensions that reference missing columns", () => {
    const cols = [
      createMockColumn({
        name: "created_at",
        display_name: "Created At",
        source: "breakout",
      }),
      createMockColumn({
        name: "sum",
        display_name: "Sum",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];
    const series = createSeries({ display: "bar", cols });

    const result = getDefaultDimensions(series, {
      "graph.dimensions": ["missing_dimension"],
    });

    expect(result).toEqual(["created_at"]);
  });

  it("reuses previous dimensions when defaults are unavailable but columns are valid", () => {
    const cols = [
      createMockColumn({
        name: "dim",
        display_name: "Dim",
        source: "breakout",
      }),
      createMockColumn({
        name: "m1",
        display_name: "M1",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m2",
        display_name: "M2",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m3",
        display_name: "M3",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m4",
        display_name: "M4",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];
    const series = createSeries({ display: "scatter", cols });

    const result = getDefaultDimensions(series, {
      "graph.dimensions": ["dim"],
    });

    expect(result).toEqual(["dim"]);
  });

  it("reuses previous metrics when defaults are unavailable but columns are valid", () => {
    const cols = [
      createMockColumn({
        name: "dim",
        display_name: "Dim",
        source: "breakout",
      }),
      createMockColumn({
        name: "m1",
        display_name: "M1",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m2",
        display_name: "M2",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m3",
        display_name: "M3",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "m4",
        display_name: "M4",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];
    const series = createSeries({ display: "scatter", cols });

    const result = getDefaultMetrics(series, {
      "graph.metrics": ["m1"],
    });

    expect(result).toEqual(["m1"]);
  });
});

const COLS = [
  createMockColumn({
    database_type: "NUMERIC",
    semantic_type: "type/Quantity",
    table_id: 2,
    binning_info: {
      binning_strategy: "num-bins",
      min_value: 0,
      max_value: 100,
      num_bins: 8,
      bin_width: 12.5,
    },
    name: "QUANTITY",
    source: "fields",
    field_ref: ["field", 2, null],
    effective_type: "type/Decimal",
    active: true,
    id: 2,
    visibility_type: "normal",
    display_name: "Quantity: 8 bins",
    base_type: "type/Decimal",
  }),
  createMockColumn({
    database_type: "BIGINT",
    semantic_type: "type/Quantity",
    name: "count",
    source: "fields",
    field_ref: [
      "field",
      "count",
      {
        "base-type": "type/BigInteger",
      },
    ],
    effective_type: "type/BigInteger",
    display_name: "Count",
    base_type: "type/BigInteger",
  }),
];

const mockSeries = [
  createMockSingleSeries(
    {
      display: "bar",
      visualization_settings: {},
      type: "question",
    },
    {
      row_count: 5,
      context: "ad-hoc",
      data: {
        rows: [
          [0, 18587],
          [12.5, 52],
          [25, 49],
          [37.5, 29],
          [50, 22],
        ],
        cols: COLS,
      },
    },
  ),
];

describe("getDefaultColumns", () => {
  it("should return valid dimension", () => {
    expect(getDefaultColumns(mockSeries)).toEqual({
      dimensions: ["QUANTITY"],
      metrics: ["count"],
    });
  });
});

describe("getDefaultBoxplotDimensions", () => {
  it("should return the dimension with the lowest cardinality", () => {
    const cols = [
      createMockColumn({
        name: "category",
        display_name: "Category",
        source: "breakout",
      }),
      createMockColumn({
        name: "status",
        display_name: "Status",
        source: "breakout",
      }),
      createMockColumn({
        name: "total",
        display_name: "Total",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];

    const rows = [
      ["Electronics", "active", 100],
      ["Electronics", "inactive", 50],
      ["Clothing", "active", 75],
      ["Clothing", "inactive", 25],
      ["Food", "active", 60],
      ["Food", "inactive", 30],
    ];

    const series = createSeries({ display: "boxplot", cols, rows });

    const result = getDefaultBoxplotDimensions(series, {});

    // "status" has cardinality 2, "category" has cardinality 3
    expect(result).toEqual(["status"]);
  });
});

describe("getYAxisSides", () => {
  const MONTH = "month";
  const CATEGORY = "category";
  const REVENUE = "revenue";
  const ORDERS = "orders";

  const renderingContext: RenderingContext = {
    getColor: (name) => name,
    measureText: () => 10,
    measureTextHeight: () => 10,
    fontFamily: "Arial",
    theme: DEFAULT_VISUALIZATION_THEME,
  };

  // The real computed settings always carry the per-series accessor; the chart
  // model reads each series' display through it.
  const lineSeries = () => ({ display: "line" as const });

  const pinnedRight =
    (...keys: string[]) =>
    ({ card }: LegacySeriesSettingsObjectKey) =>
      keys.includes(String(card._seriesKey))
        ? { ...lineSeries(), axis: "right" as const }
        : lineSeries();

  const createTwoMetricSeries = (
    rows: DatasetData["rows"],
    display: VisualizationDisplay = "line",
  ): RawSeries => [
    createMockSingleSeries(
      createMockCard({ display }),
      createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: MONTH, base_type: "type/Text" }),
            createMockColumn({ name: REVENUE, base_type: "type/Number" }),
            createMockColumn({ name: ORDERS, base_type: "type/Number" }),
          ],
          rows,
        }),
      }),
    ),
  ];

  const createBreakoutSeries = (): RawSeries => [
    createMockSingleSeries(
      createMockCard({ display: "line" }),
      createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: MONTH, base_type: "type/Text" }),
            createMockColumn({ name: CATEGORY, base_type: "type/Text" }),
            createMockColumn({ name: ORDERS, base_type: "type/Number" }),
          ],
          rows: [
            ["Jan", "a", 1],
            ["Jan", "b", 10],
            ["Jan", "c", 10000],
            ["Feb", "a", 2],
            ["Feb", "b", 20],
            ["Feb", "c", 20000],
          ],
        }),
      }),
    ),
  ];

  const twoMetricSettings = {
    "graph.dimensions": [MONTH],
    "graph.metrics": [REVENUE, ORDERS],
    "graph.y_axis.auto_split": true,
    series: lineSeries,
  };

  const breakoutSettings = {
    "graph.dimensions": [MONTH, CATEGORY],
    "graph.metrics": [ORDERS],
    "graph.y_axis.auto_split": true,
    series: lineSeries,
  };

  const divergentRows = [
    ["Jan", 1, 900],
    ["Feb", 2, 1000],
  ];

  const similarRows = [
    ["Jan", 900, 950],
    ["Feb", 1000, 1100],
  ];

  // The sidebar decides which axis label fields to offer and the renderer
  // decides which axes to draw, through different code. A disagreement either
  // hides the setting for an axis that exists or offers one for an axis that
  // does not.
  it.each([
    {
      name: "two metrics on ranges far apart",
      sides: { left: true, right: true },
      rawSeries: createTwoMetricSeries(divergentRows),
      settings: twoMetricSettings,
    },
    {
      name: "two metrics on similar ranges",
      sides: { left: true, right: false },
      rawSeries: createTwoMetricSeries(similarRows),
      settings: twoMetricSettings,
    },
    {
      name: "the automatic split turned off",
      sides: { left: true, right: false },
      rawSeries: createTwoMetricSeries(divergentRows),
      settings: { ...twoMetricSettings, "graph.y_axis.auto_split": false },
    },
    {
      name: "a single metric",
      sides: { left: true, right: false },
      rawSeries: createTwoMetricSeries(divergentRows),
      settings: { ...twoMetricSettings, "graph.metrics": [REVENUE] },
    },
    {
      name: "one series pinned to the right axis",
      sides: { left: true, right: true },
      rawSeries: createTwoMetricSeries(similarRows),
      settings: {
        ...twoMetricSettings,
        "graph.y_axis.auto_split": false,
        series: pinnedRight(ORDERS),
      },
    },
    {
      name: "every series pinned to the right axis, leaving no left axis",
      sides: { left: false, right: true },
      rawSeries: createTwoMetricSeries(similarRows),
      settings: {
        ...twoMetricSettings,
        "graph.y_axis.auto_split": false,
        series: pinnedRight(REVENUE, ORDERS),
      },
    },
    {
      name: "every breakout series pinned to the right axis",
      sides: { left: false, right: true },
      rawSeries: createBreakoutSeries(),
      settings: { ...breakoutSettings, series: pinnedRight("a", "b", "c") },
    },
    {
      name: "split panels",
      sides: { left: true, right: false },
      rawSeries: createTwoMetricSeries(divergentRows),
      settings: { ...twoMetricSettings, "graph.split_panels": true },
    },
    {
      name: "stacked bars",
      sides: { left: true, right: false },
      rawSeries: createTwoMetricSeries(divergentRows, "bar"),
      settings: {
        ...twoMetricSettings,
        series: () => ({ display: "bar" as const }),
        "stackable.stack_type": "stacked" as const,
      },
    },
    {
      name: "a breakout, where one metric column means no automatic split",
      sides: { left: true, right: false },
      rawSeries: createBreakoutSeries(),
      settings: breakoutSettings,
    },
    {
      name: "a breakout series pinned right, then grouped into Other",
      sides: { left: true, right: false },
      rawSeries: createBreakoutSeries(),
      settings: {
        ...breakoutSettings,
        "graph.max_categories_enabled": true,
        "graph.max_categories": 2,
        series: pinnedRight("c"),
      },
    },
  ])(
    "agrees with the axes the chart model builds for $name",
    ({ rawSeries, settings, sides }) => {
      const chartModel = getCartesianChartModel(
        rawSeries,
        settings,
        [],
        renderingContext,
      );

      expect({
        left: chartModel.leftAxisModel != null,
        right: chartModel.rightAxisModel != null,
      }).toEqual(sides);
      expect(getYAxisSides(rawSeries, settings)).toEqual(sides);
    },
  );

  it("reports no axes when the chart plots nothing", () => {
    expect(getYAxisSides([], {})).toEqual({ left: false, right: false });
  });

  it.each([
    { name: "no dimension", settings: { "graph.dimensions": [] } },
    { name: "no metric", settings: { "graph.metrics": [] } },
  ])(
    "reports no axes for a chart that cannot render yet, with $name",
    ({ settings }) => {
      expect(
        getYAxisSides(createTwoMetricSeries(divergentRows), {
          ...twoMetricSettings,
          ...settings,
        }),
      ).toEqual({ left: false, right: false });
    },
  );

  it("reports a left axis only for a waterfall, which never builds a right one", () => {
    expect(
      getYAxisSides(createTwoMetricSeries(divergentRows, "waterfall"), {
        ...twoMetricSettings,
        "graph.metrics": [REVENUE],
      }),
    ).toEqual({ left: true, right: false });
  });

  it.each([
    {
      name: "two metrics on ranges far apart",
      sides: { left: true, right: true },
      settings: twoMetricSettings,
    },
    {
      name: "the automatic split turned off",
      sides: { left: true, right: false },
      settings: { ...twoMetricSettings, "graph.y_axis.auto_split": false },
    },
    {
      name: "every series pinned to the right axis",
      sides: { left: false, right: true },
      settings: {
        ...twoMetricSettings,
        "graph.y_axis.auto_split": false,
        series: pinnedRight(REVENUE, ORDERS),
      },
    },
  ])(
    "agrees with the axes the box plot model builds for $name",
    ({ settings, sides }) => {
      const rawSeries = createTwoMetricSeries(divergentRows, "boxplot");
      const chartModel = getBoxPlotModel(rawSeries, settings);

      expect({
        left: chartModel.leftAxisModel != null,
        right: chartModel.rightAxisModel != null,
      }).toEqual(sides);
      expect(getYAxisSides(rawSeries, settings)).toEqual(sides);
    },
  );

  it.each([
    {
      name: "two metrics on ranges far apart, which never split on their own",
      sides: { left: true, right: false },
      settings: twoMetricSettings,
    },
    {
      name: "one series pinned to the right axis",
      sides: { left: true, right: true },
      settings: { ...twoMetricSettings, series: pinnedRight(ORDERS) },
    },
    {
      name: "every series pinned to the right axis",
      sides: { left: false, right: true },
      settings: { ...twoMetricSettings, series: pinnedRight(REVENUE, ORDERS) },
    },
  ])(
    "agrees with the axes the scatter plot model builds for $name",
    ({ settings, sides }) => {
      const rawSeries = createTwoMetricSeries(divergentRows, "scatter");
      const chartModel = getScatterPlotModel(
        rawSeries,
        settings,
        [],
        renderingContext,
      );

      expect({
        left: chartModel.leftAxisModel != null,
        right: chartModel.rightAxisModel != null,
      }).toEqual(sides);
      expect(getYAxisSides(rawSeries, settings)).toEqual(sides);
    },
  );
});
