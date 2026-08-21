import { getFontFamilyValue } from "metabase/embedding-sdk/theme/fonts";

describe("getFontFamilyValue", () => {
  describe("single font name", () => {
    it.each([
      ["Lato", '"Lato"'],
      ["Merriweather", '"Merriweather"'],
      ["Roboto Mono", '"Roboto Mono"'],
      ["Custom", '"Custom"'],
    ])("quotes %s", (font, expected) => {
      expect(getFontFamilyValue(font)).toBe(expected);
    });

    it("strips quotes already present in the input", () => {
      expect(getFontFamilyValue('"Open Sans"')).toBe('"Open Sans"');
      expect(getFontFamilyValue("'Open Sans'")).toBe('"Open Sans"');
    });
  });

  describe("font family list", () => {
    it("quotes every family separately", () => {
      expect(getFontFamilyValue("Open Sans, Helvetica")).toBe(
        '"Open Sans", "Helvetica"',
      );
    });

    it("drops empty entries", () => {
      expect(getFontFamilyValue("Lato,,Helvetica,")).toBe(
        '"Lato", "Helvetica"',
      );
    });
  });

  describe("empty input", () => {
    it.each([
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["commas only", ",,,"],
    ])("returns an empty value for %s", (_label, font) => {
      expect(getFontFamilyValue(font)).toBe("");
    });
  });
});
