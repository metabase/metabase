import { mapChartColorsToAccents } from "./accents";
import { METABASE_DARK_THEME } from "./constants/dark";
import { METABASE_LIGHT_THEME } from "./constants/light";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { deriveFullMetabaseTheme } from "./derive-theme";

describe("theme", () => {
  describe("dark theme", () => {
    it("defines the same set of keys as light theme", () => {
      const lightKeys = Object.keys(METABASE_LIGHT_THEME.colors).sort();
      const darkKeys = Object.keys(METABASE_DARK_THEME.colors).sort();

      expect(darkKeys).toEqual(lightKeys);
    });
  });

  describe("mapChartColorsToAccents", () => {
    it("maps string colors to accent keys", () => {
      const result = mapChartColorsToAccents(["#ff0000", "#00ff00", "#0000ff"]);

      expect(result).toEqual({
        accent0: "#ff0000",
        accent1: "#00ff00",
        accent2: "#0000ff",
      });
    });

    it("maps object colors with base/tint/shade", () => {
      const result = mapChartColorsToAccents([
        { base: "#ff0000", tint: "#ff8888", shade: "#880000" },
      ]);

      expect(result).toEqual({
        accent0: "#ff0000",
        "accent0-light": "#ff8888",
        "accent0-dark": "#880000",
      });
    });

    it("handles mixed string and object colors", () => {
      const result = mapChartColorsToAccents([
        "#ff0000",
        { base: "#00ff00", tint: "#88ff88" },
      ]);

      expect(result).toEqual({
        accent0: "#ff0000",
        accent1: "#00ff00",
        "accent1-light": "#88ff88",
      });
    });

    it("only maps first 8 colors", () => {
      const nineColors = Array.from({ length: 9 }, (_, i) => `#${i}${i}${i}`);
      const result = mapChartColorsToAccents(nineColors);

      expect(Object.keys(result)).toHaveLength(8);
      expect(result).not.toHaveProperty("accent8");
    });

    it("skips null/undefined colors", () => {
      const result = mapChartColorsToAccents([
        "#ff0000",
        null as unknown as string,
        "#0000ff",
      ]);

      expect(result).toEqual({
        accent0: "#ff0000",
        accent2: "#0000ff",
      });
    });
  });

  describe("resolveTheme", () => {
    // Resolve once to get expected colors including chartColors -> accent mappings
    const resolvedLightTheme = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
    });

    it("returns the resolved theme colors when no overrides are provided", () => {
      const theme = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
      });
      expect(theme.colors).toEqual(resolvedLightTheme.colors);
    });

    it("applies whitelabel colors over the base theme", () => {
      const result = deriveFullMetabaseTheme({
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
      const result = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: { brand: "#ff0000" },
        embeddingThemeOverride: { version: 2, colors: { brand: "#00ff00" } },
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

      const result = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
        embeddingThemeOverride: { version: 2, colors: userColors },
      });

      // All protected colors must remain unchanged (compare against resolved theme)
      for (const protectedColorKey of PROTECTED_COLORS) {
        expect(result.colors[protectedColorKey]).toBe(
          resolvedLightTheme.colors[protectedColorKey],
        );
      }
    });

    it("transforms chartColors to accent colors", () => {
      const result = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
        embeddingThemeOverride: {
          version: 2,
          chartColors: ["#ff0000", "#00ff00"],
        },
      });

      expect(result.colors["accent0"]).toBe("#ff0000");
      expect(result.colors["accent1"]).toBe("#00ff00");
    });

    it("chartColors override base theme accent colors", () => {
      const result = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
        embeddingThemeOverride: {
          version: 2,
          chartColors: [{ base: "#ff0000", tint: "#ff8888", shade: "#880000" }],
        },
      });

      // Cast to Record<string, string> to access tint/shade keys
      // which are outside of the core MetabaseColorKey type
      const colors = result.colors as Record<string, string>;

      expect(colors["accent0"]).toBe("#ff0000");
      expect(colors["accent0-light"]).toBe("#ff8888");
      expect(colors["accent0-dark"]).toBe("#880000");
    });
  });
});
