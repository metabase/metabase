import { COLUMN_SPLIT_SETTING } from "metabase/lib/data_grid";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { settings } from "./settings";

describe("Visualizations > Visualizations > PivotTable > settings", () => {
  describe("COLUMN_SPLIT_SETTING getValue", () => {
    it("should handle zero dimensions (aggregation only) without crashing", () => {
      // This case is invalid for pivot tables and checkRenderable will throw,
      // but getValue should not crash when computing settings
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data = createMockDatasetData({
        cols: [aggregationCol],
        rows: [[100]],
      });

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toEqual({
        rows: [],
        columns: [],
        values: ["count"],
      });
    });

    it("should handle one dimension", () => {
      const dimensionCol = createMockColumn({
        source: "breakout",
        name: "product_category",
      });
      const aggregationCol = createMockColumn({
        source: "aggregation",
        name: "count",
      });

      const data = createMockDatasetData({
        cols: [dimensionCol, aggregationCol],
        rows: [
          ["Electronics", 100],
          ["Clothing", 50],
        ],
      });

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toEqual({
        rows: ["product_category"],
        columns: [],
        values: ["count"],
      });
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

      const data = createMockDatasetData({
        cols: [dimension1, dimension2, aggregationCol],
        rows: [
          ["Electronics", "North", 100],
          ["Clothing", "South", 50],
        ],
      });

      const series = [{ data }];
      const storedSettings: Partial<VisualizationSettings> = {};

      const getValue = settings[COLUMN_SPLIT_SETTING].getValue;
      const result = getValue(series as any, storedSettings);

      expect(result).toEqual({
        rows: ["region"],
        columns: ["product_category"],
        values: ["count"],
      });
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

      const data = createMockDatasetData({
        cols: [dimension1, dimension2, aggregationCol],
        rows: [
          ["Electronics", "North", 100],
          ["Clothing", "South", 50],
        ],
      });

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

      expect(result).toEqual({
        rows: ["product_category"],
        columns: ["region"],
        values: ["count"],
      });
    });
  });
});
