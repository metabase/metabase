import { colorConfig } from "./colors";
import {
  INTERNAL_COLORS,
  METABASE_DARK_THEME,
  METABASE_LIGHT_THEME,
  getThemeV2,
  resolveTheme,
} from "./theme";

describe("theme", () => {
  describe("METABASE_LIGHT_THEME", () => {
    it("should have version 2", () => {
      expect(METABASE_LIGHT_THEME.version).toBe(2);
    });

    it("should have all colorConfig keys", () => {
      const colorConfigKeys = Object.keys(colorConfig);
      const themeColorKeys = Object.keys(METABASE_LIGHT_THEME.colors);

      expect(themeColorKeys).toEqual(expect.arrayContaining(colorConfigKeys));
      expect(themeColorKeys.length).toBe(colorConfigKeys.length);
    });

    it("should use light mode values from colorConfig", () => {
      expect(METABASE_LIGHT_THEME.colors["brand"]).toBe(
        colorConfig.brand.light,
      );
      expect(METABASE_LIGHT_THEME.colors["text-primary"]).toBe(
        colorConfig["text-primary"].light,
      );
    });
  });

  describe("METABASE_DARK_THEME", () => {
    it("should have version 2", () => {
      expect(METABASE_DARK_THEME.version).toBe(2);
    });

    it("should have all colorConfig keys", () => {
      const colorConfigKeys = Object.keys(colorConfig);
      const themeColorKeys = Object.keys(METABASE_DARK_THEME.colors);

      expect(themeColorKeys).toEqual(expect.arrayContaining(colorConfigKeys));
      expect(themeColorKeys.length).toBe(colorConfigKeys.length);
    });

    it("should use dark mode values from colorConfig", () => {
      expect(METABASE_DARK_THEME.colors["brand"]).toBe(colorConfig.brand.dark);
      expect(METABASE_DARK_THEME.colors["text-primary"]).toBe(
        colorConfig["text-primary"].dark,
      );
    });
  });

  describe("getThemeV2", () => {
    it("should return light theme for 'light' colorScheme", () => {
      expect(getThemeV2("light")).toBe(METABASE_LIGHT_THEME);
    });

    it("should return dark theme for 'dark' colorScheme", () => {
      expect(getThemeV2("dark")).toBe(METABASE_DARK_THEME);
    });
  });

  describe("resolveTheme", () => {
    it("should return base theme when no overrides provided", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
      });

      expect(result.version).toBe(2);
      expect(result.colors).toEqual(METABASE_LIGHT_THEME.colors);
    });

    it("should apply whitelabel colors over base theme", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: {
          brand: "#ff0000",
        },
      });

      expect(result.colors["brand"]).toBe("#ff0000");
      // Other colors should remain from base theme
      expect(result.colors["text-primary"]).toBe(
        METABASE_LIGHT_THEME.colors["text-primary"],
      );
    });

    it("should apply user theme override over whitelabel colors", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: {
          brand: "#ff0000",
        },
        userThemeOverride: {
          colors: {
            brand: "#00ff00",
          },
        },
      });

      // User override takes precedence
      expect(result.colors["brand"]).toBe("#00ff00");
    });

    it("should filter out internal colors from user override", () => {
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        userThemeOverride: {
          colors: {
            "metabase-brand": "#ff0000",
            brand: "#00ff00",
          },
        },
      });

      // Internal color should NOT be overridden
      expect(result.colors["metabase-brand"]).toBe(
        METABASE_LIGHT_THEME.colors["metabase-brand"],
      );
      // Regular color should be overridden
      expect(result.colors["brand"]).toBe("#00ff00");
    });

    it("should filter out all internal colors from user override", () => {
      const userColors: Record<string, string> = {};
      for (const internalColor of INTERNAL_COLORS) {
        userColors[internalColor] = "#ff0000";
      }

      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        userThemeOverride: {
          colors: userColors,
        },
      });

      // All internal colors should remain unchanged
      for (const internalColor of INTERNAL_COLORS) {
        expect(result.colors[internalColor]).toBe(
          METABASE_LIGHT_THEME.colors[internalColor],
        );
      }
    });

    it("should pass through chartColors from user override", () => {
      const chartColors = ["#ff0000", "#00ff00", "#0000ff"];
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        userThemeOverride: {
          chartColors,
        },
      });

      expect(result.chartColors).toEqual(chartColors);
    });

    it("should support chartColors with base/tint/shade structure", () => {
      const chartColors = [
        { base: "#ff0000", tint: "#ff8888", shade: "#880000" },
        "#00ff00",
      ];
      const result = resolveTheme({
        baseTheme: METABASE_LIGHT_THEME,
        userThemeOverride: {
          chartColors,
        },
      });

      expect(result.chartColors).toEqual(chartColors);
    });
  });
});
