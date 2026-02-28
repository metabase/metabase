import {
  getDefaultColumns,
  getDefaultDimensions,
  getDefaultMetrics,
  getDefaultXAxisScale,
  isXAxisScaleValid,
  queryHasExplicitSort,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import type { DatasetData, VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
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

describe("queryHasExplicitSort", () => {
  it("should return true when query has order-by clause", () => {
    const queryWithSort = createQueryWithClauses({
      orderBys: [{ tableName: "ORDERS", columnName: "ID" }],
    });
    const series = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(queryHasExplicitSort(series)).toBe(true);
  });

  it("should return false when query has no order-by clause", () => {
    const queryWithoutSort = createQuery();
    const series = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithoutSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(queryHasExplicitSort(series)).toBe(false);
  });

  it("should return false for native queries", () => {
    const series = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: {
            type: "native",
            database: 1,
            native: {
              query: "SELECT * FROM orders ORDER BY count DESC",
            },
          },
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(queryHasExplicitSort(series)).toBe(false);
  });

  it("should return false when card has no dataset_query", () => {
    const series = [
      createMockSingleSeries(
        { display: "bar" },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(queryHasExplicitSort(series)).toBe(false);
  });
});

describe("getDefaultXAxisScale", () => {
  const timeseriesSettings = {
    "graph.x_axis._is_histogram": false,
    "graph.x_axis._is_timeseries": true,
    "graph.x_axis._is_numeric": false,
  };

  const numericSettings = {
    "graph.x_axis._is_histogram": false,
    "graph.x_axis._is_timeseries": false,
    "graph.x_axis._is_numeric": true,
  };

  const histogramSettings = {
    "graph.x_axis._is_histogram": true,
    "graph.x_axis._is_timeseries": true,
    "graph.x_axis._is_numeric": true,
  };

  it("should default to ordinal when query has explicit sort order (metabase#68496)", () => {
    const queryWithSort = createQueryWithClauses({
      orderBys: [{ tableName: "ORDERS", columnName: "ID" }],
    });
    const seriesWithSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(
      getDefaultXAxisScale(timeseriesSettings, undefined, seriesWithSort),
    ).toBe("ordinal");
  });

  it("should default to timeseries when query has no explicit sort order", () => {
    const queryWithoutSort = createQuery();
    const seriesWithoutSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithoutSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    expect(
      getDefaultXAxisScale(timeseriesSettings, undefined, seriesWithoutSort),
    ).toBe("timeseries");
  });

  it("should default to timeseries when series is undefined", () => {
    expect(getDefaultXAxisScale(timeseriesSettings, undefined, undefined)).toBe(
      "timeseries",
    );
  });

  it("should default to histogram when histogram setting is true", () => {
    const queryWithSort = createQueryWithClauses({
      orderBys: [{ tableName: "ORDERS", columnName: "ID" }],
    });
    const seriesWithSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithSort),
        },
        {},
      ),
    ];
    expect(
      getDefaultXAxisScale(histogramSettings, undefined, seriesWithSort),
    ).toBe("histogram");
  });

  it("should default to linear for numeric columns without explicit sort", () => {
    const queryWithoutSort = createQuery();
    const seriesWithoutSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithoutSort),
        },
        {},
      ),
    ];
    expect(
      getDefaultXAxisScale(numericSettings, undefined, seriesWithoutSort),
    ).toBe("linear");
  });
});

describe("isXAxisScaleValid", () => {
  it("should return false for timeseries scale when query has explicit sort order (metabase#68496)", () => {
    const queryWithSort = createQueryWithClauses({
      orderBys: [{ tableName: "ORDERS", columnName: "ID" }],
    });
    const seriesWithSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    const settings = {
      "graph.x_axis.scale": "timeseries" as const,
      "graph.x_axis._is_timeseries": true,
      "graph.x_axis._is_numeric": false,
      "graph.dimensions": ["col1"],
    };
    expect(isXAxisScaleValid(seriesWithSort, settings)).toBe(false);
  });

  it("should return true for ordinal scale when query has explicit sort order", () => {
    const queryWithSort = createQueryWithClauses({
      orderBys: [{ tableName: "ORDERS", columnName: "ID" }],
    });
    const seriesWithSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    const settings = {
      "graph.x_axis.scale": "ordinal" as const,
      "graph.x_axis._is_timeseries": true,
      "graph.x_axis._is_numeric": false,
      "graph.dimensions": ["col1"],
    };
    expect(isXAxisScaleValid(seriesWithSort, settings)).toBe(true);
  });

  it("should return true for timeseries scale when query has no explicit sort order", () => {
    const queryWithoutSort = createQuery();
    const seriesWithoutSort = [
      createMockSingleSeries(
        {
          display: "bar",
          dataset_query: Lib.toJsQuery(queryWithoutSort),
        },
        {
          data: {
            rows: [[0, 1]],
            cols: [
              createMockDatetimeColumn({ name: "col1" }),
              createMockNumericColumn({ name: "col2" }),
            ],
          },
        },
      ),
    ];
    const settings = {
      "graph.x_axis.scale": "timeseries" as const,
      "graph.x_axis._is_timeseries": true,
      "graph.x_axis._is_numeric": false,
      "graph.dimensions": ["col1"],
    };
    expect(isXAxisScaleValid(seriesWithoutSort, settings)).toBe(true);
  });
});
