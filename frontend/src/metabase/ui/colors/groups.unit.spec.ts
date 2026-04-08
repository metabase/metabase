import Color from "color";

import {
  getAccentColors,
  getDeduplicatedColorKeys,
  getPreferredColorKey,
} from "./groups";
import { color } from "./palette";

describe("groups", () => {
  describe("getAccentColors", () => {
    it("should return main accent colors without gray by default", () => {
      const colors = getAccentColors({ gray: false });
      expect(colors).not.toContain(Color(color("accent-gray")).hex());
      expect(colors).not.toContain(Color(color("accent-gray-light")).hex());
      expect(colors).not.toContain(Color(color("accent-gray-dark")).hex());
    });

    it("should include gray when specified", () => {
      const colors = getAccentColors();
      expect(colors).toContain(Color(color("accent-gray")).hex());
      expect(colors).toContain(Color(color("accent-gray-light")).hex());
      expect(colors).toContain(Color(color("accent-gray-dark")).hex());
    });
  });

  describe("getPreferredColorKey", () => {
    it.each([
      ["Count", "count"],
      ["Count of rows", "count"],
      ["Cumulative count", "cum-count"],
      ["Cumulative count of ID", "cum-count"],
      ["Sum of Price", "sum"],
      ["Cumulative sum of Total", "cum-sum"],
      ["Average of Rating", "average"],
      ["Distinct values of Category", "distinct"],
      ["Max of Price", "max"],
      ["Median of Total", "median"],
      ["Min of Price", "min"],
      ["Standard deviation of Rating", "standard-deviation"],
      ["Variance of Total", "var"],
    ])('should map "%s" to "%s"', (name, expected) => {
      expect(getPreferredColorKey(name)).toBe(expected);
    });

    it.each(["aggregation", "Discount %", "Revenue", "foo"])(
      'should return undefined for "%s"',
      (name) => {
        expect(getPreferredColorKey(name)).toBeUndefined();
      },
    );
  });

  describe("getDeduplicatedColorKeys", () => {
    it.each([
      [["count"], ["count"]],
      [
        ["count", "sum"],
        ["count", "sum"],
      ],
      [
        ["count", "count"],
        ["count", "count_2"],
      ],
      [
        ["count", "sum", "count"],
        ["count", "sum", "count_2"],
      ],
      [
        ["sum", "sum", "sum"],
        ["sum", "sum_2", "sum_3"],
      ],
      [
        [undefined, "count"],
        [undefined, "count"],
      ],
    ])("should deduplicate %j to %j", (input, expected) => {
      expect(getDeduplicatedColorKeys(input)).toEqual(expected);
    });
  });
});
