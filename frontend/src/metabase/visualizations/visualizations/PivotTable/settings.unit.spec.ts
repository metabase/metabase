import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { settings } from "./settings";

const COLUMN_SPLIT_SETTING = "pivot_table.column_split";
const SHOW_GRAND_TOTALS_SETTING = "pivot.show_grand_totals";

describe("PivotTable settings", () => {
  describe(`${SHOW_GRAND_TOTALS_SETTING}`, () => {
    const setting = settings[SHOW_GRAND_TOTALS_SETTING];

    it("should have a default of true", () => {
      expect(setting.getDefault?.()).toBe(true);
    });

    it("should be hidden when show_column_totals is false", () => {
      const mockSettings = createMockVisualizationSettings({
        "pivot.show_column_totals": false,
      });
      expect(setting.getHidden?.([] as unknown as RawSeries, mockSettings)).toBe(true);
    });

    it("should be visible when show_column_totals is true", () => {
      const mockSettings = createMockVisualizationSettings({
        "pivot.show_column_totals": true,
      });
      expect(setting.getHidden?.([] as unknown as RawSeries, mockSettings)).toBe(false);
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
});
