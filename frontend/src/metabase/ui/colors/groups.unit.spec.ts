import Color from "color";

import { getAccentColors, getNamedAccentColors } from "./groups";
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

  describe("getNamedAccentColors", () => {
    it("should name every color the picker offers, in the same order", () => {
      const named = getNamedAccentColors();

      expect(named.map(({ value }) => value)).toEqual(getAccentColors());
    });

    it("should give each color the palette name it was read from", () => {
      const named = getNamedAccentColors();

      named.forEach(({ name, value }) => {
        expect(value).toBe(Color(color(name)).hex());
      });
    });

    it("should cover the base, light and dark variant of every accent", () => {
      const names = getNamedAccentColors().map(({ name }) => name);

      expect(names).toContain("accent0");
      expect(names).toContain("accent0-light");
      expect(names).toContain("accent0-dark");
      expect(names).toContain("accent-gray");
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
