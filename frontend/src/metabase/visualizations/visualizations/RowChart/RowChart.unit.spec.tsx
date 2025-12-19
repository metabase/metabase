import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import RowChartVisualization from "./RowChart";

const columns = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Count",
    display_name: "Count",
    base_type: "type/Number",
    semantic_type: "type/Number",
  }),
];

describe("RowChartVisualization", () => {
  describe("checkRenderable", () => {
    it("should not throw error for valid data", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", 10],
              ["B", 20],
              ["C", 30],
            ],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Count"],
      };

      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).not.toThrow();
    });

    it("should not throw error for empty data", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Count"],
      };

      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).not.toThrow();
    });

    it("should throw error when there are too many rows", () => {
      // Create 2001 unique dimension values (exceeds MAX_ROW_CHART_ROWS of 2000)
      const rows = Array.from({ length: 2001 }, (_, i) => [
        `Category${i}`,
        10,
      ]);

      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows,
            cols: columns,
          }),
        },
      ];

      const settings = {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Count"],
      };

      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).toThrow(ChartSettingsError);

      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).toThrow(/can't display more than 2000 rows/);
    });

    it("should not throw error when row count is at the limit", () => {
      // Create exactly 2000 unique dimension values (at MAX_ROW_CHART_ROWS limit)
      const rows = Array.from({ length: 2000 }, (_, i) => [
        `Category${i}`,
        10,
      ]);

      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows,
            cols: columns,
          }),
        },
      ];

      const settings = {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Count"],
      };

      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).not.toThrow();
    });

    it("should count only unique dimension values", () => {
      // Create 3000 rows but only 100 unique dimension values
      const rows = Array.from({ length: 3000 }, (_, i) => [
        `Category${i % 100}`, // Only 100 unique categories
        10,
      ]);

      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows,
            cols: columns,
          }),
        },
      ];

      const settings = {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Count"],
      };

      // Should not throw because there are only 100 unique dimension values
      expect(() =>
        RowChartVisualization.checkRenderable(series, settings),
      ).not.toThrow();
    });
  });
});
