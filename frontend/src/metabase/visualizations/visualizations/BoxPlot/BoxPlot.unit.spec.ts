import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { BOXPLOT_CHART_DEFINITION } from "./chart-definition";

const categoryColumn = createMockColumn({
  name: "Category",
  display_name: "Category",
  base_type: "type/Text",
  source: "breakout",
});

const idColumn = createMockColumn({
  name: "ID",
  display_name: "ID",
  base_type: "type/Integer",
  semantic_type: "type/PK",
  source: "breakout",
});

const metricColumn = createMockColumn({
  name: "Value",
  display_name: "Value",
  base_type: "type/Number",
  source: "aggregation",
});

const columns = [categoryColumn, idColumn, metricColumn];

describe("BoxPlot", () => {
  describe("getSensibility", () => {
    it("should return sensible for data with two dimensions and a metric", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 1, 10],
          ["A", 2, 20],
          ["A", 3, 30],
          ["A", 4, 40],
          ["A", 5, 50],
        ],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.getSensibility!(data)).not.toBe("nonsensible");
    });

    it("should return nonsensible when there is only one dimension column", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 10],
          ["A", 20],
          ["A", 30],
          ["A", 40],
          ["A", 50],
        ],
        cols: [categoryColumn, metricColumn],
      });

      expect(BOXPLOT_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when there are no rows", () => {
      const data = createMockDatasetData({
        rows: [],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when there is no metric column", () => {
      const columnsWithoutMetric = [
        createMockColumn({
          name: "Category1",
          display_name: "Category1",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "Category2",
          display_name: "Category2",
          base_type: "type/Text",
          source: "breakout",
        }),
      ];

      const data = createMockDatasetData({
        rows: [
          ["A", "X"],
          ["B", "Y"],
          ["C", "Z"],
          ["D", "W"],
          ["E", "V"],
        ],
        cols: columnsWithoutMetric,
      });

      expect(BOXPLOT_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return sensible for multiple categories with sufficient total rows", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 1, 10],
          ["A", 2, 20],
          ["B", 3, 30],
          ["B", 4, 40],
          ["B", 5, 50],
        ],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.getSensibility!(data)).not.toBe("nonsensible");
    });
  });
});
