import {
  getAvailableAdditionalColumns,
  getComputedAdditionalColumnsValue,
  getDefaultBoxplotDimensions,
  getDefaultColumns,
  getDefaultDimensions,
  getDefaultMetrics,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { DatasetData, VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

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

describe("getAvailableAdditionalColumns", () => {
  // Regression test for UXW-4069: when dashcard data has not loaded yet,
  // `sanitizeSeriesData` produces an empty `cols: []` placeholder.
  // `getCartesianChartColumns` then returns an object where `dimension` is
  // `undefined` (because the stored dimension name can't be resolved), and
  // `getAvailableAdditionalColumns` previously threw
  // `TypeError: Cannot read properties of undefined (reading 'column')`,
  // flooding the browser console via the settings framework's try/catch.
  it("does not throw when series cols are empty but dimensions/metrics settings exist", () => {
    const series = [
      {
        card: createMockCard({ display: "bar" }),
        data: createMockDatasetData({ cols: [], rows: [] }),
      },
    ];
    const settings = {
      "graph.dimensions": ["Date"],
      "graph.metrics": ["Count"],
    };

    expect(() => getAvailableAdditionalColumns(series, settings)).not.toThrow();
    expect(getAvailableAdditionalColumns(series, settings)).toEqual([]);
  });

  it("does not throw when stored dimension column is missing from data", () => {
    const cols = [
      createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ];
    const series = [
      {
        card: createMockCard({ display: "bar" }),
        data: createMockDatasetData({ cols, rows: [[1]] }),
      },
    ];
    const settings = {
      "graph.dimensions": ["missing_dimension"],
      "graph.metrics": ["count"],
    };

    expect(() => getAvailableAdditionalColumns(series, settings)).not.toThrow();
  });

  it("treats resolved metric columns as referenced even when the stored dimension is missing", () => {
    // Edge case: stored `graph.dimensions` references a column that doesn't
    // exist (e.g. renamed/removed), but `graph.metrics` still resolves. The
    // resolved metric must not appear in the available additional columns.
    const metricCol = createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/Integer",
      source: "aggregation",
    });
    const extraCol = createMockColumn({
      name: "extra",
      display_name: "Extra",
      source: "fields",
    });
    const series = [
      {
        card: createMockCard({ display: "bar" }),
        data: createMockDatasetData({
          cols: [metricCol, extraCol],
          rows: [[1, "x"]],
        }),
      },
    ];
    const settings = {
      "graph.dimensions": ["missing_dimension"],
      "graph.metrics": ["count"],
    };

    expect(getAvailableAdditionalColumns(series, settings)).toEqual([extraCol]);
  });

  it("returns available columns normally when dimension and metric are present", () => {
    const dimCol = createMockColumn({
      name: "created_at",
      display_name: "Created At",
      source: "breakout",
    });
    const metricCol = createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/Integer",
      source: "aggregation",
    });
    const extraCol = createMockColumn({
      name: "extra",
      display_name: "Extra",
      source: "fields",
    });

    const series = [
      {
        card: createMockCard({ display: "bar" }),
        data: createMockDatasetData({
          cols: [dimCol, metricCol, extraCol],
          rows: [["2024", 1, "x"]],
        }),
      },
    ];
    const settings = {
      "graph.dimensions": ["created_at"],
      "graph.metrics": ["count"],
    };

    expect(getAvailableAdditionalColumns(series, settings)).toEqual([extraCol]);
  });
});

describe("getComputedAdditionalColumnsValue", () => {
  // Regression test for UXW-4069: ensure the `getValue` callback for
  // `graph.tooltip_columns` does not throw when series data has not loaded.
  it("does not throw when series cols are empty", () => {
    const series = [
      {
        card: createMockCard({ display: "bar" }),
        data: createMockDatasetData({ cols: [], rows: [] }),
      },
    ];
    const settings = {
      "graph.dimensions": ["Date"],
      "graph.metrics": ["Count"],
      "graph.tooltip_columns": [],
    };

    expect(() =>
      getComputedAdditionalColumnsValue(series, settings),
    ).not.toThrow();
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
