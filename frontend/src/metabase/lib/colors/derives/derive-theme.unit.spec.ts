import { PROTECTED_COLORS } from "../constants/protected-colors";
import { METABASE_LIGHT_THEME } from "../constants/themes/light";

import { deriveFullMetabaseTheme } from "./derive-theme";

describe("deriveFullMetabaseTheme", () => {
  it("applies whitelabel colors over the base theme", () => {
    const derived = deriveFullMetabaseTheme({
      colorScheme: "light",
      whitelabelColors: { brand: "#ff0000" },
    });

    // The whitelabel color should override the base theme color
    expect(derived.colors["brand"]).toBe("#ff0000");

    // Other colors should remain from base theme
    expect(derived.colors["text-primary"]).toBe(
      METABASE_LIGHT_THEME.colors["text-primary"],
    );
  });

  it("applies embedding theme overrides over whitelabel colors", () => {
    const derived = deriveFullMetabaseTheme({
      colorScheme: "light",
      whitelabelColors: { brand: "#ff0000" },
      embeddingThemeOverride: { version: 2, colors: { brand: "#00ff00" } },
    });

    // User overrides takes precedence over instance whitelabel colors
    expect(derived.colors["brand"]).toBe("#00ff00");
  });

  it("filters out all internal colors from embedding overrides", () => {
    const derivedBaseLightTheme = deriveFullMetabaseTheme({
      colorScheme: "light",
    });

    const embeddingColors: Record<string, string> = {};

    // modular embedding user tries to override the protected colors
    for (const protectedColorKey of PROTECTED_COLORS) {
      embeddingColors[protectedColorKey] = "#ff0000";
    }

    const derived = deriveFullMetabaseTheme({
      colorScheme: "light",
      embeddingThemeOverride: { version: 2, colors: embeddingColors },
    });

    // All protected colors must remain unchanged
    for (const protectedColorKey of PROTECTED_COLORS) {
      expect(derived.colors[protectedColorKey]).toBe(
        derivedBaseLightTheme.colors[protectedColorKey],
      );
    }
  });

  it("maps chartColors to accent colors", () => {
    const derived = deriveFullMetabaseTheme({
      colorScheme: "light",
      embeddingThemeOverride: {
        version: 2,
        chartColors: ["#ff0000", "#00ff00"],
      },
    });

    expect(derived.colors["accent0"]).toBe("#ff0000");
    expect(derived.colors["accent1"]).toBe("#00ff00");
  });

  it("overrides accent colors via chartColors", () => {
    const result = deriveFullMetabaseTheme({
      colorScheme: "light",
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

  describe("color derivation from input colors", () => {
    it("derives background colors from background-primary (light background)", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: {
          version: 2,
          colors: { "background-primary": "#ffffff" },
        },
      });

      // Should derive secondary/tertiary backgrounds
      expect(derived.colors["background-secondary"]).toBeDefined();
      expect(derived.colors["background-tertiary"]).toBeDefined();
      expect(derived.colors["background-primary-inverse"]).toBeDefined();
      expect(derived.colors["border"]).toBeDefined();
      expect(derived.colors["tooltip-background"]).toBeDefined();
    });

    it("derives background colors from background-primary (dark background)", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "dark",
        embeddingThemeOverride: {
          version: 2,
          colors: { "background-primary": "#1a1a1a" },
        },
      });

      // Should derive secondary/tertiary backgrounds for dark theme
      expect(derived.colors["background-secondary"]).toBeDefined();
      expect(derived.colors["background-tertiary"]).toBeDefined();
      expect(derived.colors["background-primary-inverse"]).toBeDefined();
      expect(derived.colors["border"]).toBeDefined();
    });

    it("derives text colors from text-primary", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: {
          version: 2,
          colors: { "text-primary": "#303030" },
        },
      });

      // Should derive secondary/tertiary text colors
      expect(derived.colors["text-secondary"]).toBeDefined();
      expect(derived.colors["text-tertiary"]).toBeDefined();
      expect(derived.colors["text-primary-inverse"]).toBeDefined();
      expect(derived.colors["text-secondary-inverse"]).toBeDefined();
    });

    it("derives brand colors from brand", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: {
          version: 2,
          colors: { brand: "#509ee3" },
        },
      });

      // Should derive brand variations
      expect(derived.colors["brand-light"]).toBeDefined();
      expect(derived.colors["brand-lighter"]).toBeDefined();
      expect(derived.colors["brand-dark"]).toBeDefined();
      expect(derived.colors["brand-darker"]).toBeDefined();
      expect(derived.colors["text-brand"]).toBeDefined();
      expect(derived.colors["background-brand"]).toBeDefined();
      expect(derived.colors["focus"]).toBeDefined();
    });

    it("explicit overrides take precedence over derived colors", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: {
          version: 2,
          colors: {
            "background-primary": "#ffffff",
            "background-secondary": "#custom-override",
          },
        },
      });

      // Explicit override should win over derived value
      expect(derived.colors["background-secondary"]).toBe("#custom-override");
    });

    it("derives a complete theme from just 3 colors", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: {
          version: 2,
          colors: {
            brand: "#509ee3",
            "background-primary": "#ffffff",
            "text-primary": "#303030",
          },
        },
      });

      // All derived colors should be present
      expect(derived.colors["background-secondary"]).toBeDefined();
      expect(derived.colors["background-primary-inverse"]).toBeDefined();
      expect(derived.colors["text-secondary"]).toBeDefined();
      expect(derived.colors["brand-light"]).toBeDefined();
      expect(derived.colors["border"]).toBeDefined();
    });
  });
});
