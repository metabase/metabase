import { createMockColumn } from "metabase-types/api/mocks";
import { sumMetric, getDatasetSeriesKey, groupDataset } from "./dataset";

describe("dataset transform functions", () => {
  describe("sumMetric", () => {
    it("should return the sum when both arguments are numbers", () => {
      expect(sumMetric(3, 7)).toBe(10);
    });

    it("should return the left number when right is not a number", () => {
      expect(sumMetric(5, null)).toBe(5);
    });

    it("should return the right number when left is not a number", () => {
      expect(sumMetric(null, 5)).toBe(5);
    });

    it("should return null when neither left nor right is a number", () => {
      expect(sumMetric(null, null)).toBeNull();
    });
  });

  describe("getDatasetSeriesKey", () => {
    const column = createMockColumn({ name: "count" });

    it("should return the column name if breakoutValue is undefined", () => {
      expect(getDatasetSeriesKey(column)).toBe("count");
    });

    it("should return the breakoutValue concatenated with column name if breakoutValue is provided", () => {
      expect(getDatasetSeriesKey(column, "breakoutValue")).toBe(
        "breakoutValue:count",
      );
    });
  });

  describe("groupDataset", () => {
    const columns = [
      createMockColumn({ name: "month" }),
      createMockColumn({ name: "category" }),
      createMockColumn({ name: "count", base_type: "type/Integer" }),
    ];
    const rows = [
      [1, "category1", 200],
      [2, "category1", 300],
      [3, "category2", 400],
      [3, "category3", 500],
    ];

    it("should group metric columns by the specified dimensionIndex", () => {
      expect(groupDataset(rows, columns, 0)).toStrictEqual([
        { month: 1, count: 200 },
        { month: 2, count: 300 },
        { month: 3, count: 900 },
      ]);
    });

    it("should handle breakoutIndex if provided", () => {
      expect(groupDataset(rows, columns, 0, 1)).toStrictEqual([
        { month: 1, count: 200, "category1:count": 200 },
        { month: 2, count: 300, "category1:count": 300 },
        {
          month: 3,
          count: 900,
          "category2:count": 400,
          "category3:count": 500,
        },
      ]);
    });

    it("should return empty array if there are no rows", () => {
      const result = groupDataset([], columns, 1);
      expect(result).toEqual([]);
    });
  });
});
