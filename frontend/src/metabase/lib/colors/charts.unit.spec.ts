import { color } from "./palette";
import { getColorsForValues } from "./charts";

describe("getColorsForValues", () => {
  describe("hash-based mapping", () => {
    it("should use preferred colors", () => {
      const keys = ["count", "sum"];

      const newMapping = getColorsForValues(keys);

      expect(newMapping).toEqual({
        count: color("accent0"),
        sum: color("accent1"),
      });
    });

    it("should use accent colors for other values", () => {
      const keys = ["count", "sum", "sum_2", "distinct"];

      const newMapping = getColorsForValues(keys);

      expect(newMapping).toEqual({
        count: color("accent0"),
        sum: color("accent1"),
        sum_2: color("accent6"),
        distinct: color("accent4"),
      });
    });

    it("should preserve existing colors", () => {
      const keys = ["count", "sum", "average"];
      const existingMapping = { count: color("brand"), sum: color("brand") };

      const newMapping = getColorsForValues(keys, existingMapping);

      expect(newMapping).toEqual({
        count: color("brand"),
        sum: color("brand"),
        average: color("accent2"),
      });
    });
  });
});
