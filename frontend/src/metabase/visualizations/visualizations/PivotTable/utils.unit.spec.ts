import type { PivotTableColumnSplitSetting } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import {
  CELL_PADDING,
  MAX_HEADER_CELL_WIDTH,
  MIN_HEADER_CELL_WIDTH,
  ROW_TOGGLE_ICON_WIDTH,
} from "./constants";
import type { HeaderItem } from "./types";
import {
  addMissingCardBreakouts,
  getColumnValues,
  getLeftHeaderWidths,
  isColumnValid,
  isFormattablePivotColumn,
  updateValueWithCurrentColumns,
} from "./utils";

describe("Visualizations > Visualizations > PivotTable > utils", () => {
  const cols = [
    createMockColumn({ source: "breakout", name: "field-123" }),
    createMockColumn({ source: "breakout", name: "field-456" }),
    createMockColumn({ source: "breakout", name: "field-789" }),
    createMockColumn({ source: "aggregation", name: "aggregation-1" }),
    createMockColumn({ source: "aggregation", name: "aggregation-2" }),
  ];

  describe("isColumnValid", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isColumnValid(createMockColumn({ source: "aggregation" }));
      expect(result).toBe(true);
    });

    it("should return true if a column is a breakout", () => {
      const result = isColumnValid(createMockColumn({ source: "breakout" }));
      expect(result).toBe(true);
    });

    it("should return true if a column is a pivot grouping", () => {
      const result = isColumnValid(
        createMockColumn({
          source: "fields",
          name: "pivot-grouping",
        }),
      );
      expect(result).toBe(true);
    });

    it("should return false if a column is a field", () => {
      const result = isColumnValid(createMockColumn({ source: "fields" }));
      expect(result).toBe(false);
    });
  });

  describe("isFormattablePivotColumn", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isFormattablePivotColumn(
        createMockColumn({
          source: "aggregation",
        }),
      );
      expect(result).toBe(true);
    });

    it("should return false if a column is a breakout", () => {
      const result = isFormattablePivotColumn(
        createMockColumn({
          source: "breakout",
        }),
      );
      expect(result).toBe(false);
    });
  });

  describe("updateValueWithCurrentColumns", () => {
    it("should not update settings when no columns have changed", () => {
      const pivotSettings: PivotTableColumnSplitSetting = {
        columns: [cols[0].name],
        rows: [cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name],
      };

      const result = updateValueWithCurrentColumns(pivotSettings, cols);

      expect(result).toEqual(pivotSettings);
    });

    it("should add a newly-added field to rows", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name],
        values: [cols[3].name, cols[4].name],
      };

      const newPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [
          cols[0].name,
          cols[1].name,
          cols[2].name, // <-- new column
        ],
        values: [cols[3].name, cols[4].name],
      };

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should add a newly-added aggregation to values", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name],
        values: [cols[3].name],
      };

      const newPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name],
        values: [
          cols[3].name,
          cols[4].name, // <-- new aggregation
        ],
      };

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should remove a removed field from rows", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name, "removed_column"],
        values: [cols[3].name],
      };

      const newPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name],
      };

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });

    it("should remove a removed aggregation from values", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name, "removed_aggregation"],
      };

      const newPivotSettings: PivotTableColumnSplitSetting = {
        columns: [],
        rows: [cols[0].name, cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name],
      };

      const result = updateValueWithCurrentColumns(oldPivotSettings, cols);

      expect(result).toEqual(newPivotSettings);
    });
  });

  describe("addMissingCardBreakouts", () => {
    it("should not mess with pivot settings that aren't misssing breakouts", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [cols[0].name],
        rows: [cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name],
      };

      const result = addMissingCardBreakouts(oldPivotSettings, cols);

      expect(result).toEqual(oldPivotSettings);
    });

    it("should add a missing breakout to pivot settings", () => {
      const oldPivotSettings: PivotTableColumnSplitSetting = {
        columns: [cols[0].name],
        rows: [cols[1].name, cols[2].name],
        values: [cols[3].name, cols[4].name],
      };

      const newColumn = createMockColumn({
        name: "new_breakout",
        source: "breakout",
      });
      const newPivotSettings: PivotTableColumnSplitSetting = {
        columns: [cols[0].name],
        rows: [cols[1].name, cols[2].name, newColumn.name],
        values: [cols[3].name, cols[4].name],
      };

      const result = addMissingCardBreakouts(oldPivotSettings, [
        ...cols,
        newColumn,
      ]);

      expect(result).toEqual(newPivotSettings);
    });
  });

  describe("getLeftHeaderWidths", () => {
    it("should return an array of widths", () => {
      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        getColumnTitle: () => "test-123",
        font: {},
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
        font: {},
      });
      expect(totalLeftHeaderWidths).toEqual(MIN_HEADER_CELL_WIDTH * 3);
    });

    it("should not exceed the max width", () => {
      const { leftHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        // jest-dom thinks characters are 1px wide
        getColumnTitle: () => "x".repeat(MAX_HEADER_CELL_WIDTH),
        font: {},
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
        font: {},
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
        font: {},
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
