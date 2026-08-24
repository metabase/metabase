import { getFontFamilyValue } from "metabase/utils/fonts";

describe("getFontFamilyValue", () => {
  describe("single font name", () => {
    it.each([
      ["Lato", '"Lato", Arial, sans-serif'],
      ["Merriweather", '"Merriweather", "Lora", serif'],
      ["Roboto Mono", '"Roboto Mono", monospace'],
    ])("appends the fallback chain for %s", (font, expected) => {
      expect(getFontFamilyValue(font)).toBe(expected);
    });

    it.each([
      ["Custom", '"Custom", sans-serif'],
      ["Comic Sans MS", '"Comic Sans MS", sans-serif'],
    ])("falls back to sans-serif for %s", (font, expected) => {
      expect(getFontFamilyValue(font)).toBe(expected);
    });
  });

  describe("font family list", () => {
    it("supports lists and picks the fallback chain from the first family", () => {
      expect(getFontFamilyValue("Open Sans, Helvetica")).toBe(
        '"Open Sans", "Helvetica", "Lato", sans-serif',
      );
    });

    it("drops empty entries", () => {
      expect(getFontFamilyValue("Inter,,Helvetica,")).toBe(
        '"Inter", "Helvetica", sans-serif',
      );
    });
  });

  describe("empty input", () => {
    it.each([
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["commas only", ",,,"],
    ])("returns the bare fallback for %s", (_label, font) => {
      expect(getFontFamilyValue(font)).toBe("sans-serif");
    });
  });
});
