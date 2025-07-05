import type { DatasetData, RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { RADAR_CHART_DEFINITION } from "./chart-definition";

const createMockRawSeries = (data: Partial<DatasetData>): RawSeries => [
  {
    card: createMockCard({ display: "radar" }),
    data: createMockDatasetData(data),
  },
];

describe("RadarChart > chart-definition", () => {
  describe("isSensible", () => {
    const mockData = createMockDatasetData({
      cols: [
        createMockColumn({
          name: "category",
          display_name: "Category",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "metric1",
          display_name: "Metric 1",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "metric2",
          display_name: "Metric 2",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "metric3",
          display_name: "Metric 3",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
      ],
      rows: [
        ["A", 10, 20, 30],
        ["B", 15, 25, 35],
        ["C", 20, 30, 40],
        ["D", 25, 35, 45],
      ],
    });

    it("should return true for suitable data", () => {
      expect(RADAR_CHART_DEFINITION.isSensible(mockData)).toBe(true);
    });

    it("should return false when there are fewer than 3 rows", () => {
      const data = createMockDatasetData({
        cols: mockData.cols,
        rows: [
          ["A", 10, 20, 30],
          ["B", 15, 25, 35],
        ],
      });
      expect(RADAR_CHART_DEFINITION.isSensible(data)).toBe(false);
    });

    it("should return false when there are fewer than 2 metrics", () => {
      const data = createMockDatasetData({
        cols: [
          createMockColumn({
            name: "category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "metric1",
            display_name: "Metric 1",
            base_type: "type/Number",
            semantic_type: "type/Number",
          }),
        ],
        rows: [
          ["A", 10],
          ["B", 15],
          ["C", 20],
        ],
      });
      expect(RADAR_CHART_DEFINITION.isSensible(data)).toBe(false);
    });

    it("should return false when there is only one row", () => {
      const data = createMockDatasetData({
        cols: mockData.cols,
        rows: [["A", 10, 20, 30]],
      });
      expect(RADAR_CHART_DEFINITION.isSensible(data)).toBe(false);
    });
  });

  describe("checkRenderable", () => {
    const mockSeries = createMockRawSeries({
      cols: [
        createMockColumn({
          name: "category",
          display_name: "Category",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "metric1",
          display_name: "Metric 1",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "metric2",
          display_name: "Metric 2",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
      ],
      rows: [
        ["A", 10, 20],
        ["B", 15, 25],
        ["C", 20, 30],
        ["D", 25, 35],
      ],
    });

    it("should not throw for valid data", () => {
      const settings = {
        "radar.dimension": "category",
        "radar.metrics": ["metric1", "metric2"],
      };
      expect(() =>
        RADAR_CHART_DEFINITION.checkRenderable(mockSeries, settings),
      ).not.toThrow();
    });

    it("should throw when dimension is not selected", () => {
      const settings = {
        "radar.metrics": ["metric1", "metric2"],
      };
      expect(() =>
        RADAR_CHART_DEFINITION.checkRenderable(mockSeries, settings),
      ).toThrow("Please select a dimension");
    });

    it("should throw when fewer than 2 metrics are selected", () => {
      const settings = {
        "radar.dimension": "category",
        "radar.metrics": ["metric1"],
      };
      expect(() =>
        RADAR_CHART_DEFINITION.checkRenderable(mockSeries, settings),
      ).toThrow("Please select at least two metrics to compare");
    });

    it("should throw when there are too many indicators", () => {
      const series = createMockRawSeries({
        cols: mockSeries[0].data.cols,
        rows: Array.from({ length: 35 }, (_, i) => [`Item ${i}`, 10, 20]),
      });
      const settings = {
        "radar.dimension": "category",
        "radar.metrics": ["metric1", "metric2"],
      };
      expect(() =>
        RADAR_CHART_DEFINITION.checkRenderable(series, settings),
      ).toThrow("Radar chart doesn't support more than 30 indicators");
    });

    it("should throw when there are fewer than 3 data points", () => {
      const series = createMockRawSeries({
        cols: mockSeries[0].data.cols,
        rows: [
          ["A", 10, 20],
          ["B", 15, 25],
        ],
      });
      const settings = {
        "radar.dimension": "category",
        "radar.metrics": ["metric1", "metric2"],
      };
      expect(() =>
        RADAR_CHART_DEFINITION.checkRenderable(series, settings),
      ).toThrow("Radar chart requires at least 3 data points");
    });
  });
});
