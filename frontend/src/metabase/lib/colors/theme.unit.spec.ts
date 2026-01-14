import { METABASE_DARK_THEME } from "./constants/dark";
import { METABASE_LIGHT_THEME } from "./constants/light";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { resolveTheme } from "./theme";

describe("theme", () => {
  describe("dark theme", () => {
    it("defines the same set of keys as light theme", () => {
      const lightKeys = Object.keys(METABASE_LIGHT_THEME.colors).sort();
      const darkKeys = Object.keys(METABASE_DARK_THEME.colors).sort();

      expect(darkKeys).toEqual(lightKeys);
    });
  });

  describe("resolveTheme", () => {
    it("returns the base theme colors when no overrides are provided", () => {
      const theme = resolveTheme({ baseTheme: METABASE_LIGHT_THEME });
      expect(theme.colors).toEqual(METABASE_LIGHT_THEME.colors);
    });

    it("applies whitelabel colors over the base theme", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: { brand: "#ff0000" },
      });

      // The whitelabel color should override the base theme color
      expect(result.colors["brand"]).toBe("#ff0000");

      // Other colors should remain from base theme
      expect(result.colors["text-primary"]).toBe(
        METABASE_LIGHT_THEME.colors["text-primary"],
      );
    });

    it("applies user theme overrides over whitelabel colors", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: { brand: "#ff0000" },
        userThemeOverride: { colors: { brand: "#00ff00" } },
      });

      // User overrides takes precedence over instance whitelabel colors
      expect(result.colors["brand"]).toBe("#00ff00");
    });

    it("filters out all internal colors from user overrides", () => {
      const userColors: Record<string, string> = {};

      // Modular Embedding user tries to override the protected colors
      for (const protectedColorKey of PROTECTED_COLORS) {
        userColors[protectedColorKey] = "#ff0000";
      }

      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        userThemeOverride: { colors: userColors },
      });

      // All protected colors must remain unchanged
      for (const protectedColorKey of PROTECTED_COLORS) {
        expect(result.colors[protectedColorKey]).toBe(
          METABASE_LIGHT_THEME.colors[protectedColorKey],
        );
      }
    });
  });
});
