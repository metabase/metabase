import { getAccentColors } from "./groups";
import { color } from "./palette";

describe("groups", () => {
  describe("getAccentColors", () => {
    it("should return main accent colors without grey by default", () => {
      const colors = getAccentColors({ grey: false });
      expect(colors).not.toContain(color("accent-grey"));
      expect(colors).not.toContain(color("accent-grey-light"));
      expect(colors).not.toContain(color("accent-grey-dark"));
    });

    it("should include grey when specified", () => {
      const colors = getAccentColors();
      expect(colors).toContain(color("accent-grey"));
      expect(colors).toContain(color("accent-grey-light"));
      expect(colors).toContain(color("accent-grey-dark"));
    });
  });
});
