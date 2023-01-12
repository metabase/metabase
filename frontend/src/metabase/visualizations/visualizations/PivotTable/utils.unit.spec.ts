import type { Column } from "metabase-types/types/Dataset";
import type { Card } from "metabase-types/types/Card";
import type { PivotSetting } from "./types";

import {
  isColumnValid,
  isFormattablePivotColumn,
  updateValueWithCurrentColumns,
  addMissingCardBreakouts,
  getLeftHeaderWidths,
} from "./utils";

import { MAX_HEADER_CELL_WIDTH, MIN_HEADER_CELL_WIDTH } from "./constants";

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
  ] as Column[];

  describe("isColumnValid", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isColumnValid({ source: "aggregation" } as Column);
      expect(result).toBe(true);
    });

    it("should return true if a column is a breakout", () => {
      const result = isColumnValid({ source: "breakout" } as Column);
      expect(result).toBe(true);
    });

    it("should return true if a column is a pivot grouping", () => {
      const result = isColumnValid({
        source: "fields",
        name: "pivot-grouping",
      } as Column);
      expect(result).toBe(true);
    });

    it("should return false if a column is a field", () => {
      const result = isColumnValid({ source: "fields" } as Column);
      expect(result).toBe(false);
    });
  });

  describe("isFormattablePivotColumn", () => {
    it("should return true if a column is an aggregation", () => {
      const result = isFormattablePivotColumn({
        source: "aggregation",
      } as Column);
      expect(result).toBe(true);
    });

    it("should return false if a column is a breakout", () => {
      const result = isFormattablePivotColumn({ source: "breakout" } as Column);
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
      const { totalHeaderWidths } = getLeftHeaderWidths({
        rowIndexes: [0, 1, 2],
        getColumnTitle: () => "test-123",
      });
      expect(totalHeaderWidths).toEqual(MIN_HEADER_CELL_WIDTH * 3);
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
  });
});
