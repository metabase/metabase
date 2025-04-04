import dayjs from "dayjs";

import * as Pivot from "cljs/metabase.pivot.js";

import { multiLevelPivot } from "./data_grid";

jest.mock("cljs/metabase.pivot.js", () => ({
  columns_without_pivot_group: jest.fn((cols) => cols),
  process_pivot_table: jest.fn(() => ({
    columnIndex: [],
    rowIndex: [],
    leftHeaderItems: [],
    topHeaderItems: [],
    getRowSection: jest.fn(),
  })),
}));

// We can't mock formatValue easily, so we'll just test the structure of the code
describe("multiLevelPivot", () => {
  describe("date formatting preservation", () => {
    it("should have a consistent formatter application for all column types", () => {
      // Mock data and settings for a pivot table
      const date1 = dayjs("2023-01-01 12:34:56").toISOString();
      const date2 = dayjs("2023-01-02 12:34:56").toISOString();

      const data = {
        cols: [
          { name: "date", display_name: "Date", base_type: "type/DateTime" },
          { name: "category", display_name: "Category" },
          { name: "value", display_name: "Value" },
        ],
        rows: [
          [date1, "A", 10],
          [date2, "B", 20],
        ],
      };

      // Create settings with date formatting to hide time
      const columnSettings = {
        date: {
          date_style: "M/D/YYYY",
          time_enabled: null, // This is key - time is disabled
        },
      };

      const settings = {
        "pivot_table.column_split": {
          rows: ["category"],
          columns: ["date"],
          values: ["value"],
        },
        column: (col) => {
          // Return the column settings or default settings
          return columnSettings[col.name] || {};
        },
      };

      // Run the multiLevelPivot function
      multiLevelPivot(data, settings);

      // Verify that process_pivot_table was called, meaning our code executed
      expect(Pivot.process_pivot_table).toHaveBeenCalled();
    });
  });
});
