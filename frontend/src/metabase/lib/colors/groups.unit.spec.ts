import Color from "color";

import { getAccentColors } from "./groups";
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
});
