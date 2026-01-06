import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
} from "metabase-types/api/mocks";

import { getDefaultSortRows, getPieRows } from "./pie";

const defaultCardArgs = {
  name: "Test Card",
  display: "pie",
  visualization_settings: {},
} as const;

const data = createMockDatasetData({
  cols: [
    createMockColumn({ name: "Category" }),
    createMockColumn({ name: "Count" }),
  ],
  rows: [
    ["A", 10],
    ["B", 20],
    ["C", 15],
  ],
});

describe("getDefaultSortRows", () => {
  it("should return true (auto-sort) when there is no order-by clause", () => {
    const datasetQuery = createMockStructuredDatasetQuery({
      query: createMockStructuredQuery({
        "source-table": 1,
      }),
    });
    const series = [
      {
        card: createMockCard({
          ...defaultCardArgs,
          dataset_query: datasetQuery,
        }),
        data,
      },
    ];

    const result = getDefaultSortRows(series);

    expect(result).toBe(true);
  });

  it("should return false (preserve data order) when there is an explicit order-by clause", () => {
    const datasetQuery = createMockStructuredDatasetQuery({
      query: createMockStructuredQuery({
        "source-table": 1,
        "order-by": [["asc", ["field", 1, null]]],
      }),
    });
    const series = [
      {
        card: createMockCard({
          ...defaultCardArgs,
          dataset_query: datasetQuery,
        }),
        data,
      },
    ];

    const result = getDefaultSortRows(series);

    expect(result).toBe(false);
  });

  it("should return true (auto-sort) for native queries since we cannot detect order-by", () => {
    const datasetQuery = createMockNativeDatasetQuery({
      native: {
        query: "SELECT category, count FROM table ORDER BY count DESC",
      },
    });
    const series = [
      {
        card: createMockCard({
          ...defaultCardArgs,
          dataset_query: datasetQuery,
        }),
        data,
      },
    ];

    const result = getDefaultSortRows(series);

    // Native queries always return true because we can't detect ORDER BY
    expect(result).toBe(true);
  });

  it("should return true when dataset_query is undefined", () => {
    const series = [
      {
        card: createMockCard({
          ...defaultCardArgs,
          dataset_query: undefined,
        }),
        data,
      },
    ];

    const result = getDefaultSortRows(series);

    expect(result).toBe(true);
  });
});

describe("getPieRows", () => {
  const formatter = (value: unknown) => String(value);

  describe("sorting behavior based on order-by", () => {
    it("should auto-sort by metric (descending) when pie.sort_rows is true", () => {
      const datasetQuery = createMockStructuredDatasetQuery();
      const series = [
        {
          card: createMockCard({
            ...defaultCardArgs,
            dataset_query: datasetQuery,
          }),
          data,
        },
      ];

      const settings = {
        "pie.dimension": "Category",
        "pie.metric": "Count",
        "pie.sort_rows": true,
        "pie.colors": {},
        column: () => ({}),
      };

      const result = getPieRows(series, settings, formatter);
      expect(result.map((row) => row.key)).toEqual(["B", "C", "A"]);
    });

    it("should preserve data order when pie.sort_rows is false", () => {
      const datasetQuery = createMockStructuredDatasetQuery({
        query: createMockStructuredQuery({
          "source-table": 1,
          "order-by": [["asc", ["field", 1, null]]],
        }),
      });
      const series = [
        {
          card: createMockCard({
            ...defaultCardArgs,
            dataset_query: datasetQuery,
          }),
          data,
        },
      ];

      const settings = {
        "pie.dimension": "Category",
        "pie.metric": "Count",
        "pie.sort_rows": false,
        "pie.rows": [], // No saved rows
        "pie.colors": {},
        column: () => ({}),
      };

      const result = getPieRows(series, settings, formatter);
      expect(result.map((row) => row.key)).toEqual(["A", "B", "C"]);
    });

    it("should preserve manual sort order when pie.sort_rows is false and pie.rows exist", () => {
      const datasetQuery = createMockStructuredDatasetQuery({
        query: createMockStructuredQuery({
          "source-table": 1,
          "order-by": [["asc", ["field", 1, null]]],
        }),
      });
      const data = createMockDatasetData({
        cols: [
          createMockColumn({ name: "Category" }),
          createMockColumn({ name: "Count" }),
        ],
        rows: [
          ["A", 10],
          ["B", 30],
          ["C", 20],
        ],
      });
      const series = [
        {
          card: createMockCard({
            ...defaultCardArgs,
            dataset_query: datasetQuery,
          }),
          data,
        },
      ];

      const settings = {
        "pie.dimension": "Category",
        "pie.metric": "Count",
        "pie.sort_rows": false,
        "pie.sort_rows_dimension": "Category",
        "pie.rows": ["C", "B", "A"].map((key) => ({
          key,
          name: key,
          originalName: key,
          color: "#FF0000",
          defaultColor: true,
          enabled: true,
          hidden: false,
          isOther: false,
        })),
        "pie.colors": {},
        column: () => ({}),
      };

      const result = getPieRows(series, settings, formatter);
      expect(result.map((row) => row.key)).toEqual(["C", "B", "A"]);
    });
  });
});
