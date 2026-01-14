import type { MetabaseTheme } from "./MetabaseTheme";
import type { MetabaseEmbedThemeV2 } from "./MetabaseThemeV2";
import { isThemeV1, isThemeV2 } from "./theme-version";

describe("theme-version", () => {
  describe("isThemeV2", () => {
    it("should return true for V2 theme with version: 2", () => {
      const theme: MetabaseEmbedThemeV2 = {
        version: 2,
        colors: {
          brand: "#ff0000",
        },
      };
      expect(isThemeV2(theme)).toBe(true);
    });

    it("should return true for V2 theme with only version", () => {
      const theme: MetabaseEmbedThemeV2 = {
        version: 2,
      };
      expect(isThemeV2(theme)).toBe(true);
    });

    it("should return false for V1 theme without version", () => {
      const theme: MetabaseTheme = {
        colors: {
          brand: "#ff0000",
        },
      };
      expect(isThemeV2(theme)).toBe(false);
    });

    it("should return false for empty V1 theme", () => {
      const theme: MetabaseTheme = {};
      expect(isThemeV2(theme)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isThemeV2(undefined)).toBe(false);
    });
  });

  describe("isThemeV1", () => {
    it("should return true for V1 theme without version", () => {
      const theme: MetabaseTheme = {
        colors: {
          brand: "#ff0000",
        },
      };
      expect(isThemeV1(theme)).toBe(true);
    });

    it("should return true for empty V1 theme", () => {
      const theme: MetabaseTheme = {};
      expect(isThemeV1(theme)).toBe(true);
    });

    it("should return false for V2 theme", () => {
      const theme: MetabaseEmbedThemeV2 = {
        version: 2,
        colors: {
          brand: "#ff0000",
        },
      };
      expect(isThemeV1(theme)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isThemeV1(undefined)).toBe(false);
    });
  });
});
