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
      ["Cumulative count", "count"],
      ["Cumulative count of ID", "count"],
      ["Sum of Price", "sum"],
      ["Cumulative sum of Total", "sum"],
      ["Average of Rating", "avg"],
      ["Distinct values of Category", "count"],
      ["Max of Price", "max"],
      ["Median of Total", "median"],
      ["Min of Price", "min"],
      ["Standard deviation of Rating", "stddev"],
      ["Variance of Total", "var"],
    ])('should map "%s" to "%s"', (name, expected) => {
      expect(getPreferredColorKey(name)).toBe(expected);
    });

    it.each([
      "aggregation",
      "Discount %",
      "Revenue",
      "foo",
      "Count Inverted",
      "Sum Total",
      "Average Rating Score",
      "Maximum",
      "Minimum",
    ])('should return undefined for "%s"', (name) => {
      expect(getPreferredColorKey(name)).toBeUndefined();
    });
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
