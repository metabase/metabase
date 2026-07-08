import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { settings } from "./settings";

const COLUMN_SPLIT_SETTING = "pivot_table.column_split";

describe("PivotTable settings", () => {
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
