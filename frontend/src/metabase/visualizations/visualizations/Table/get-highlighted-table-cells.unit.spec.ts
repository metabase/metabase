import type {
  HighlightedObject,
  PivotedDatasetColumn,
} from "metabase/visualizations/types";
import { getHighlightedTableCells } from "metabase/visualizations/visualizations/Table/get-highlighted-table-cells";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

const CATEGORY_COLUMN = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  source: "breakout",
});

const METRIC_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
});

const PIVOT_COLUMN = createMockColumn({
  name: "SOURCE",
  display_name: "Source",
  source: "breakout",
});

const NORMAL_COLUMN = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  source: "breakout",
});

const ORGANIC_METRIC_COLUMN: PivotedDatasetColumn = {
  ...METRIC_COLUMN,
  _dimension: { value: "Organic", column: PIVOT_COLUMN },
};

const PAID_METRIC_COLUMN: PivotedDatasetColumn = {
  ...METRIC_COLUMN,
  _dimension: { value: "Paid", column: PIVOT_COLUMN },
};

describe("getHighlightedTableCells", () => {
  const card = createMockCard({ id: 1 });

  const aggregatedSeries = [
    createMockSingleSeries(
      { id: 1 },
      {
        data: {
          cols: [CATEGORY_COLUMN, METRIC_COLUMN],
          rows: [
            ["Gadget", 10],
            ["Widget", 20],
            ["Gadget", 30],
          ],
        },
      },
    ),
  ];

  it("returns matching aggregated table cells", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [
        ["Gadget", 10],
        ["Widget", 20],
        ["Gadget", 30],
      ],
    });

    const highlighted: HighlightedObject = {
      cardId: card.id,
      columnName: METRIC_COLUMN.name,
      dimensions: [{ columnName: CATEGORY_COLUMN.name, value: "Widget" }],
    };

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        highlighted,
        false,
      ),
    ).toEqual([{ rowIndex: 1, columnIndex: 1 }]);
  });

  it("returns all cells when duplicate dimension values match", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [
        ["Gadget", 10],
        ["Widget", 20],
        ["Gadget", 30],
      ],
    });

    const highlighted: HighlightedObject = {
      cardId: card.id,
      columnName: METRIC_COLUMN.name,
      dimensions: [{ columnName: CATEGORY_COLUMN.name, value: "Gadget" }],
    };

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        highlighted,
        false,
      ),
    ).toEqual([
      { rowIndex: 0, columnIndex: 1 },
      { rowIndex: 2, columnIndex: 1 },
    ]);
  });

  it("returns pivot cells using sourceRows mapping", () => {
    const sourceData = createMockDatasetData({
      cols: [NORMAL_COLUMN, PIVOT_COLUMN, METRIC_COLUMN],
      rows: [
        ["2024-01-01", "Organic", 10],
        ["2024-01-01", "Paid", 20],
        ["2024-02-01", "Organic", 30],
      ],
    });

    const renderedData = createMockDatasetData({
      cols: [NORMAL_COLUMN, ORGANIC_METRIC_COLUMN, PAID_METRIC_COLUMN],
      rows: [
        ["2024-01-01", 10, 20],
        ["2024-02-01", 30, null],
      ],
      sourceRows: [
        [0, 0, 1],
        [2, null, null],
      ],
    });

    const highlighted: HighlightedObject = {
      cardId: card.id,
      columnName: METRIC_COLUMN.name,
      dimensions: [
        { columnName: NORMAL_COLUMN.name, value: "2024-01-01" },
        { columnName: PIVOT_COLUMN.name, value: "Paid" },
      ],
    };

    expect(
      getHighlightedTableCells(
        [createMockSingleSeries({ id: 1 }, { data: sourceData })],
        renderedData,
        highlighted,
        true,
      ),
    ).toEqual([{ rowIndex: 0, columnIndex: 2 }]);
  });

  it("returns no cells for the wrong card", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [["Gadget", 10]],
    });

    const highlighted: HighlightedObject = {
      cardId: 999,
      columnName: METRIC_COLUMN.name,
      dimensions: [{ columnName: CATEGORY_COLUMN.name, value: "Gadget" }],
    };

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        highlighted,
        false,
      ),
    ).toEqual([]);
  });

  it("returns no cells when dimensions are missing", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [["Gadget", 10]],
    });

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        {
          cardId: card.id,
          columnName: METRIC_COLUMN.name,
        },
        false,
      ),
    ).toEqual([]);
  });

  it("falls back to the only aggregation column when columnName is missing", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [["Gadget", 10]],
    });

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        {
          cardId: card.id,
          dimensions: [{ columnName: CATEGORY_COLUMN.name, value: "Gadget" }],
        },
        false,
      ),
    ).toEqual([{ rowIndex: 0, columnIndex: 1 }]);
  });

  it("returns no cells when no source row matches", () => {
    const renderedData = createMockDatasetData({
      cols: [CATEGORY_COLUMN, METRIC_COLUMN],
      rows: [["Gadget", 10]],
    });

    const highlighted: HighlightedObject = {
      cardId: card.id,
      columnName: METRIC_COLUMN.name,
      dimensions: [{ columnName: CATEGORY_COLUMN.name, value: "Missing" }],
    };

    expect(
      getHighlightedTableCells(
        aggregatedSeries,
        renderedData,
        highlighted,
        false,
      ),
    ).toEqual([]);
  });
});
