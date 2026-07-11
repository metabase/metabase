import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { _columnSettings, settings } from "./settings";

const COLUMN_SPLIT_SETTING = "pivot_table.column_split";
const COLUMN_SHOW_TOTALS = "pivot_table.column_show_totals";
const COLUMN_FORMATTING_SETTING = "table.column_formatting";

describe("PivotTable settings", () => {
  describe(`${COLUMN_FORMATTING_SETTING} getProps`, () => {
    it("does not throw when the series has no data (metabase#37380)", () => {
      // A user without table access gets a pivot series whose `data` is
      // undefined; previously `series[0].data.cols` threw and left the
      // question in a non-working state.
      const series = [{ card: createMockCard({ display: "pivot" }) }];

      expect(() => {
        settings[COLUMN_FORMATTING_SETTING].getProps(series);
      }).not.toThrow();

      expect(settings[COLUMN_FORMATTING_SETTING].getProps(series)).toEqual({
        canHighlightRow: false,
        cols: [],
      });
    });

    it("passes through the formattable (aggregation) columns when data is present", () => {
      const aggregationColumn = createMockColumn({
        name: "count",
        source: "aggregation",
      });
      const breakoutColumn = createMockColumn({
        name: "CATEGORY",
        source: "breakout",
      });
      const data = createMockDatasetData({
        cols: [breakoutColumn, aggregationColumn],
      });
      const series = [{ card: createMockCard({ display: "pivot" }), data }];

      expect(settings[COLUMN_FORMATTING_SETTING].getProps(series)).toEqual({
        canHighlightRow: false,
        cols: [aggregationColumn],
      });
    });
  });

  describe(`${COLUMN_SPLIT_SETTING} getValue`, () => {
    it("should not throw when the query has no dimension columns (metabase#56235)", () => {
      // a Count-only query has zero dimensions, which previously left an
      // `undefined` slot in `rows` and threw when we mapped to `col.name`
      const data = createMockDatasetData({
        rows: [[0]],
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            source: "aggregation",
            base_type: "type/Integer",
            effective_type: "type/Integer",
          }),
        ],
      });

      const card = createMockCard({ display: "pivot" });

      expect(() => {
        settings[COLUMN_SPLIT_SETTING].getValue([{ data, card }], {});
      }).not.toThrow();
    });
  });

  describe(`${COLUMN_SHOW_TOTALS} getDefault`, () => {
    const getDefault = _columnSettings[COLUMN_SHOW_TOTALS].getDefault;

    const categoryRef = [
      "field",
      7,
      { "base-type": "type/Text", "source-field": 11 },
    ];
    const vendorRef = [
      "field",
      8,
      { "base-type": "type/Text", "source-field": 11 },
    ];
    const sourceRef = [
      "field",
      9,
      { "base-type": "type/Text", "source-field": 13 },
    ];

    const categoryColumn = createMockColumn({
      name: "CATEGORY",
      field_ref: categoryRef,
    });
    const sourceColumn = createMockColumn({
      name: "SOURCE",
      field_ref: sourceRef,
    });

    it("defaults totals on for a non-terminal row when settings use legacy field refs (metabase#50346)", () => {
      // Legacy pivot settings store `rows` as field refs, not column names.
      // A column that appears (by field ref) in any but the last row position
      // must still default to showing totals, otherwise its section cannot be
      // collapsed.
      const legacySettings = {
        [COLUMN_SPLIT_SETTING]: {
          rows: [categoryRef, vendorRef, sourceRef],
          columns: [],
          values: [],
        },
      };

      expect(
        getDefault(categoryColumn, categoryColumn, {
          settings: legacySettings,
        }),
      ).toBe(true);
    });

    it("does not default totals on for the terminal row with legacy field refs", () => {
      const legacySettings = {
        [COLUMN_SPLIT_SETTING]: {
          rows: [categoryRef, vendorRef, sourceRef],
          columns: [],
          values: [],
        },
      };

      expect(
        getDefault(sourceColumn, sourceColumn, {
          settings: legacySettings,
        }),
      ).toBe(false);
    });

    it("defaults totals on for a non-terminal row when settings use column names", () => {
      const newSettings = {
        [COLUMN_SPLIT_SETTING]: {
          rows: ["CATEGORY", "VENDOR", "SOURCE"],
          columns: [],
          values: [],
        },
      };

      expect(
        getDefault(categoryColumn, categoryColumn, {
          settings: newSettings,
        }),
      ).toBe(true);
    });
  });
});
