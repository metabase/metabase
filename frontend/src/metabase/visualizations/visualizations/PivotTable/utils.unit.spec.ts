import type { Card, DatasetColumn } from "metabase-types/api";

import {
  MAX_HEADER_CELL_WIDTH,
  MIN_HEADER_CELL_WIDTH,
  CELL_PADDING,
  ROW_TOGGLE_ICON_WIDTH,
} from "./constants";
import type { PivotSetting, HeaderItem } from "./types";
import {
  isColumnValid,
  isFormattablePivotColumn,
  updateValueWithCurrentColumns,
  addMissingCardBreakouts,
  getLeftHeaderWidths,
  getColumnValues,
} from "./utils";

describe("Visualizations > Visualizations > PivotTable > utils", () => {
  const cols = [
    { source: "field", field_ref: ["field", 123, null], name: "field-123" },
    { source: "field", field_ref: ["field", 456, null], name: "field-456" },
    { source: "field", field_ref: ["field", 789, null], name: "field-789" },
    {
      source: "aggregation",
      field_ref: ["aggregation", 1],
      name: "aggregation-1",
    },
    {
      source: "aggregation",
      field_ref: ["aggregation", 2],
      name: "aggregation-2",
    },
  ] as DatasetColumn[];

  describe("isColumnValid", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isColumnValid({ source: "aggregation" } as DatasetColumn);
      expect(result).toBe(true);
    });

    it("should return true if a column is a breakout", () => {
      const result = isColumnValid({ source: "breakout" } as DatasetColumn);
      expect(result).toBe(true);
    });

    it("should return true if a column is a pivot grouping", () => {
      const result = isColumnValid({
        source: "fields",
        name: "pivot-grouping",
      } as DatasetColumn);
      expect(result).toBe(true);
    });

    it("should return false if a column is a field", () => {
      const result = isColumnValid({ source: "fields" } as DatasetColumn);
      expect(result).toBe(false);
    });
  });

  describe("isFormattablePivotColumn", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isFormattablePivotColumn({
        source: "aggregation",
      } as DatasetColumn);
      expect(result).toBe(true);
    });

    it("should return false if a column is a breakout", () => {
      const result = isFormattablePivotColumn({
        source: "breakout",
      } as DatasetColumn);
      expect(result).toBe(false);
    });
  });

  describe("updateValueWithCurrentColumns", () => {
    it("should not update settings when no columns have changed", () => {
      const pivotSettings = {
        columns: [cols[0].field_ref],
        rows: [cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const result = updateValueWithCurrentColumns(pivotSettings, cols);

      expect(result).toEqual(pivotSettings);
    });

    it("should add a newly-added field to rows", () => {
      const oldPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const newPivotSettings = {
        columns: [],
        rows: [
          cols[0].field_ref,
          cols[1].field_ref,
          cols[2].field_ref, // <-- new column
        ],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should add a newly-added aggregation to values", () => {
      const oldPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref],
      } as unknown as PivotSetting;

      const newPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        values: [
          cols[3].field_ref,
          cols[4].field_ref, // <-- new aggregation
        ],
      } as unknown as PivotSetting;

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should remove a removed field from rows", () => {
      const oldPivotSettings = {
        columns: [],
        rows: [
          cols[0].field_ref,
          cols[1].field_ref,
          cols[2].field_ref,
          ["field", 999, null], // <-- removed column
        ],
        values: [cols[3].field_ref],
      } as unknown as PivotSetting;

      const newPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should remove a removed aggregation from values", () => {
      const oldPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        values: [
          cols[3].field_ref,
          cols[4].field_ref,
          ["aggregation", 999], // <-- removed aggregation
        ],
      } as unknown as PivotSetting;

      const newPivotSettings = {
        columns: [],
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });
  });

  describe("addMissingCardBreakouts", () => {
    it("should not mess with pivot settings that aren't misssing breakouts", () => {
      const oldPivotSettings = {
        columns: [cols[0].field_ref],
        rows: [cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const card = {
        dataset_query: {
          type: "query",
          query: {
            "source-table": 1,
            aggregation: [["count"]],
            breakout: [...cols.map(col => col.field_ref)],
          },
        },
      } as unknown as Card;

      const result = addMissingCardBreakouts(oldPivotSettings, card);

      expect(result).toEqual(oldPivotSettings);
    });

    it("should add a missing breakout to pivot settings", () => {
      const oldPivotSettings = {
        columns: [cols[0].field_ref],
        rows: [cols[1].field_ref, cols[2].field_ref],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const newPivotSettings = {
        columns: [cols[0].field_ref],
        rows: [
          cols[1].field_ref,
          cols[2].field_ref,
          ["field", 999, null], // <-- new breakout
        ],
        values: [cols[3].field_ref, cols[4].field_ref],
      } as unknown as PivotSetting;

      const card = {
        dataset_query: {
          type: "query",
          query: {
            "source-table": 1,
            aggregation: [["count", 1]],
            breakout: [
              ...cols.map(col => col.field_ref),
              ["field", 999, null], // <-- new breakout
            ],
          },
        },
      } as unknown as Card;

      const result = addMissingCardBreakouts(oldPivotSettings, card);

      expect(result).toEqual(newPivotSettings);
    });
  });

  describe("getLeftHeaderWidths", () => {
    it("should return an array of widths", () => {
      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        getColumnTitle: () => "test-123",
      });
      // jest-dom thinks all characters are 1px wide, so we get the minimum
      expect(leftHeaderWidths).toEqual([
        MIN_HEADER_CELL_WIDTH,
        MIN_HEADER_CELL_WIDTH,
        MIN_HEADER_CELL_WIDTH,
      ]);
    });

    it("should return the total of all widths", () => {
      const { totalLeftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        getColumnTitle: () => "test-123",
      });
      expect(totalLeftHeaderWidths).toEqual(MIN_HEADER_CELL_WIDTH * 3);
    });

    it("should not exceed the max width", () => {
      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        // jest-dom thinks characters are 1px wide
        getColumnTitle: () => "x".repeat(MAX_HEADER_CELL_WIDTH),
      });

      expect(leftHeaderWidths).toEqual([
        MAX_HEADER_CELL_WIDTH,
        MAX_HEADER_CELL_WIDTH,
        MAX_HEADER_CELL_WIDTH,
      ]);
    });

    it("should return the wider of the column header or data width", () => {
      const data = [
        { depth: 0, value: "x".repeat(150) },
        { depth: 0, value: "foo2" },
        { depth: 1, value: "bar1" },
        { depth: 1, value: "bar2" },
        { depth: 2, value: "baz1" },
        { depth: 4, value: "boo1" },
      ] as HeaderItem[];

      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2, 3, 4],
        leftHeaderItems: data,
        getColumnTitle: () => "x".repeat(70),
      });

      expect(leftHeaderWidths).toEqual([
        150 + CELL_PADDING,
        70 + CELL_PADDING + ROW_TOGGLE_ICON_WIDTH,
        70 + CELL_PADDING + ROW_TOGGLE_ICON_WIDTH,
        70 + CELL_PADDING + ROW_TOGGLE_ICON_WIDTH,
        70 + CELL_PADDING + ROW_TOGGLE_ICON_WIDTH,
      ]);
    });

    it("should factor in the toggle icon width for columns with subtotals", () => {
      const data = [
        { depth: 0, value: "x".repeat(100), hasSubtotal: true },
        { depth: 0, value: "foo2" },
        { depth: 1, value: "bar1" },
        { depth: 1, value: "bar2" },
        { depth: 2, value: "baz1" },
        { depth: 4, value: "boo1" },
      ] as HeaderItem[];

      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2, 3, 4],
        leftHeaderItems: data,
        getColumnTitle: () => "test-123",
      });

      expect(leftHeaderWidths).toEqual([
        100 + CELL_PADDING + ROW_TOGGLE_ICON_WIDTH,
        MIN_HEADER_CELL_WIDTH,
        MIN_HEADER_CELL_WIDTH,
        MIN_HEADER_CELL_WIDTH,
        MIN_HEADER_CELL_WIDTH,
      ]);
    });
  });

  describe("getColumnValues", () => {
    it("can collect column values from left header data", () => {
      const data = [
        { depth: 0, value: "foo1" },
        { depth: 0, value: "foo2" },
        { depth: 1, value: "bar1" },
        { depth: 1, value: "bar2" },
        { depth: 2, value: "baz1" },
        { depth: 4, value: "boo1" },
      ] as HeaderItem[];

      const result = getColumnValues(data);

      expect(result).toEqual([
        { values: ["foo1", "foo2"], hasSubtotal: false },
        { values: ["bar1", "bar2"], hasSubtotal: false },
        { values: ["baz1"], hasSubtotal: false },
        undefined, // no depth of 3
        { values: ["boo1"], hasSubtotal: false },
      ]);
    });

    it("detects columns with subtotals", () => {
      const data = [
        { depth: 0, value: "foo1", hasSubtotal: false },
        { depth: 0, value: "foo2", hasSubtotal: true },
        { depth: 1, value: "bar1", hasSubtotal: false },
        { depth: 1, value: "bar2", hasSubtotal: false },
        { depth: 2, value: "baz1", hasSubtotal: true },
      ] as HeaderItem[];

      const result = getColumnValues(data);

      expect(result).toEqual([
        { values: ["foo1", "foo2"], hasSubtotal: true },
        { values: ["bar1", "bar2"], hasSubtotal: false },
        { values: ["baz1"], hasSubtotal: true },
      ]);
    });

    it("handles null values", () => {
      const data = [
        { depth: 0, value: "foo1", hasSubtotal: false },
        { depth: 0, value: null, hasSubtotal: true },
        { depth: 1, value: "bar1", hasSubtotal: false },
        { depth: 1, value: "bar2", hasSubtotal: false },
        { depth: 2, value: "baz1", hasSubtotal: true },
      ] as HeaderItem[];

      const result = getColumnValues(data);

      expect(result).toEqual([
        { values: ["foo1", null], hasSubtotal: true },
        { values: ["bar1", "bar2"], hasSubtotal: false },
        { values: ["baz1"], hasSubtotal: true },
      ]);
    });
  });
});
