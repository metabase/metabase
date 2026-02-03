import {
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
