import { COLUMN_SPLIT_SETTING } from "metabase/lib/data_grid";
import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { settings } from "./settings";

describe("Visualizations > Visualizations > PivotTable > settings", () => {
  describe("COLUMN_SPLIT_SETTING getValue", () => {
    it("should handle zero dimensions gracefully without throwing error", () => {
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data: DatasetData = {
        cols: [aggregationCol],
        rows: [[100]],
        native_form: { query: "select count(*) from table" },
      };

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toBeDefined();
      expect(result.rows).toEqual([]);
      expect(result.columns).toEqual([]);
      expect(result.values).toEqual(["count"]);
    });

    it("should handle one dimension without error", () => {
      const dimensionCol = createMockColumn({
        source: "breakout",
        name: "product_category",
      });
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data: DatasetData = {
        cols: [dimensionCol, aggregationCol],
        rows: [
          ["Electronics", 100],
          ["Clothing", 50],
        ],
        native_form: { query: "select product_category, count(*) from table" },
      };

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toBeDefined();
      expect(result.rows).toEqual(["product_category"]);
      expect(result.columns).toEqual([]);
      expect(result.values).toEqual(["count"]);
    });

    it("should partition two dimensions correctly", () => {
      const dimension1 = createMockColumn({
        source: "breakout",
        name: "product_category",
        fingerprint: {
          global: { "distinct-count": 5 },
        },
      });
      const dimension2 = createMockColumn({
        source: "breakout",
        name: "region",
        fingerprint: {
          global: { "distinct-count": 10 },
        },
      });
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data: DatasetData = {
        cols: [dimension1, dimension2, aggregationCol],
        rows: [
          ["Electronics", "North", 100],
          ["Clothing", "South", 50],
        ],
        native_form: { query: "select category, region, count(*) from table" },
      };

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toBeDefined();
      expect(result.columns).toEqual(["product_category"]);
      expect(result.rows).toEqual(["region"]);
      expect(result.values).toEqual(["count"]);
    });

    it("should use existing settings when available", () => {
      const dimension1 = createMockColumn({
        source: "breakout",
        name: "product_category",
      });
      const dimension2 = createMockColumn({
        source: "breakout",
        name: "region",
      });
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data: DatasetData = {
        cols: [dimension1, dimension2, aggregationCol],
        rows: [
          ["Electronics", "North", 100],
          ["Clothing", "South", 50],
        ],
        native_form: { query: "select category, region, count(*) from table" },
      };

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {
        [COLUMN_SPLIT_SETTING]: {
          rows: ["product_category"],
          columns: ["region"],
          values: ["count"],
        },
      };

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toBeDefined();
      expect(result.rows).toEqual(["product_category"]);
      expect(result.columns).toEqual(["region"]);
      expect(result.values).toEqual(["count"]);
    });
  });
});
