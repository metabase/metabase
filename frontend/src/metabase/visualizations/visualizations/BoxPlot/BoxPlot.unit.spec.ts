import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { BOXPLOT_CHART_DEFINITION } from "./chart-definition";

const categoryColumn = createMockColumn({
  name: "Category",
  display_name: "Category",
  base_type: "type/Text",
});

const idColumn = createMockColumn({
  name: "ID",
  display_name: "ID",
  base_type: "type/Integer",
});

const metricColumn = createMockColumn({
  name: "Value",
  display_name: "Value",
  base_type: "type/Number",
  semantic_type: "type/Number",
});

const columns = [categoryColumn, idColumn, metricColumn];

describe("BoxPlot", () => {
  describe("isSensible", () => {
    it("should return true for data with two dimensions and a metric", () => {
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

      expect(BOXPLOT_CHART_DEFINITION.isSensible(data)).toBe(true);
    });

    it("should return false when there is only one dimension column", () => {
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

      expect(BOXPLOT_CHART_DEFINITION.isSensible(data)).toBe(false);
    });

    it("should return false when there are no rows", () => {
      const data = createMockDatasetData({
        rows: [],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible(data)).toBe(false);
    });

    it("should return false when there is no metric column", () => {
      const columnsWithoutMetric = [
        createMockColumn({
          name: "Category1",
          display_name: "Category1",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Category2",
          display_name: "Category2",
          base_type: "type/Text",
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

      expect(BOXPLOT_CHART_DEFINITION.isSensible(data)).toBe(false);
    });

    it("should return true for multiple categories with sufficient total rows", () => {
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

      expect(BOXPLOT_CHART_DEFINITION.isSensible(data)).toBe(true);
    });
  });
});
