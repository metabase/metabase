import Color from "color";

import { getAccentColors, getPreferredColor } from "./groups";
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

  describe("getPreferredColor", () => {
    it("should match exact key names", () => {
      expect(getPreferredColor("count")).toBe(color("accent0"));
      expect(getPreferredColor("sum")).toBe(color("accent1"));
      expect(getPreferredColor("average")).toBe(color("accent2"));
    });

    it("should match keys as substrings of display names", () => {
      expect(getPreferredColor("Count of rows")).toBe(color("accent0"));
      expect(getPreferredColor("Sum of Price")).toBe(color("accent1"));
      expect(getPreferredColor("Average of Total")).toBe(color("accent2"));
    });

    it("should match case-insensitively", () => {
      expect(getPreferredColor("COUNT")).toBe(color("accent0"));
      expect(getPreferredColor("Sum of Price")).toBe(color("accent1"));
    });

    it("should return undefined for unrecognized keys", () => {
      expect(getPreferredColor("aggregation")).toBeUndefined();
      expect(getPreferredColor("foo")).toBeUndefined();
    });
  });
});
