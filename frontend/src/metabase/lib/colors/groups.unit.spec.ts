import { getAccentColors } from "./groups";
import { color } from "./palette";

describe("groups", () => {
  describe("getAccentColors", () => {
    it("should return main accent colors without gray by default", () => {
      const colors = getAccentColors({ gray: false });
      expect(colors).not.toContain(color("accent-gray"));
      expect(colors).not.toContain(color("accent-gray-light"));
      expect(colors).not.toContain(color("accent-gray-dark"));
    });

    it("should include gray when specified", () => {
      const colors = getAccentColors();
      expect(colors).toContain(color("accent-gray"));
      expect(colors).toContain(color("accent-gray-light"));
      expect(colors).toContain(color("accent-gray-dark"));
    });
  });
});
