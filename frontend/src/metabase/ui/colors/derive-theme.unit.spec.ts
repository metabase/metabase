import { deriveChartShadeColor, deriveChartTintColor } from "./accents";
import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { BRAND_RAMP_TO_OCEAN } from "./constants/brand-ramp";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { METABASE_DARK_THEME } from "./constants/themes/dark";
import { METABASE_LIGHT_THEME } from "./constants/themes/light";
import { deriveFullMetabaseTheme } from "./derive-theme";

const baseColors = getBaseColorsForThemeDefinitionOnly();

const dynamicBrandRampColors = (colors: Record<string, string>) =>
  Object.entries(colors)
    .filter(([, value]) => value in BRAND_RAMP_TO_OCEAN)
    .map(([key]) => key);

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

  it("applies whitelabel accent colors over the base theme", () => {
    const derived = deriveFullMetabaseTheme({
      colorScheme: "light",
      whitelabelColors: {
        accent0: "#ff0000",
        "accent0-light": "#00ff00",
        "accent0-dark": "#0000ff",
        accent2: "#bada55",
        "accent3-light": "#4B9CD3",
      },
    });

    //accent 0 should use provided colors
    expect(derived.colors["accent0"]).toBe("#ff0000");
    expect(derived.colors["accent0-light"]).toBe("#00ff00");
    expect(derived.colors["accent0-dark"]).toBe("#0000ff");

    //accent 1 should be default
    expect(derived.colors["accent1"]).toBe(METABASE_LIGHT_THEME.chartColors[1]);
    expect(derived.colors["accent1-light"]).toBe(
      // Unjustified type cast. FIXME
      deriveChartTintColor(METABASE_LIGHT_THEME.chartColors[1] as string),
    );
    expect(derived.colors["accent1-dark"]).toBe(
      // Unjustified type cast. FIXME
      deriveChartShadeColor(METABASE_LIGHT_THEME.chartColors[1] as string),
    );

    //accent 2 should calculate light and dark from provided color
    expect(derived.colors["accent2"]).toBe("#bada55");
    expect(derived.colors["accent2-light"]).toBe(
      deriveChartTintColor("#bada55"),
    );
    expect(derived.colors["accent2-dark"]).toBe(
      deriveChartShadeColor("#bada55"),
    );

    //accent 3 should calculate base and dark from provided color
    const base = deriveChartShadeColor("#4B9CD3");
    expect(derived.colors["accent3"]).toBe(base);
    expect(derived.colors["accent3-light"]).toBe("#4B9CD3");
    expect(derived.colors["accent3-dark"]).toBe(deriveChartShadeColor(base));
  });

  describe("brand ramp", () => {
    it.each([
      ["light", METABASE_LIGHT_THEME],
      ["dark", METABASE_DARK_THEME],
    ])(
      "resolves the %s brand ramp to Ocean when the brand color is not customized",
      (colorScheme, theme) => {
        const derived = deriveFullMetabaseTheme({
          colorScheme: colorScheme === "dark" ? "dark" : "light",
        });

        // Every color the theme defined off the ramp must now be a literal Ocean stop
        expect(dynamicBrandRampColors(derived.colors)).toEqual([]);
        expect(dynamicBrandRampColors(theme.colors).length).toBeGreaterThan(0);
      },
    );

    it("resolves brand ramp stops to their matching Ocean stops", () => {
      const derived = deriveFullMetabaseTheme({ colorScheme: "light" });

      // METABASE_LIGHT_THEME defines these off brand[50], brand[60] and brand[10]
      expect(derived.colors["text-brand"]).toBe(baseColors.ocean[50]);
      expect(derived.colors["switch-checked"]).toBe(baseColors.ocean[60]);
      expect(derived.colors["background-brand"]).toBe(baseColors.ocean[10]);
    });

    it("keeps the dynamic brand ramp when whitelabel sets a brand color", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        whitelabelColors: { brand: "#ff0000" },
      });

      expect(derived.colors["text-brand"]).toBe(
        METABASE_LIGHT_THEME.colors["text-brand"],
      );
    });

    it("keeps the dynamic brand ramp when an embedding theme sets a brand color", () => {
      const derived = deriveFullMetabaseTheme({
        colorScheme: "light",
        embeddingThemeOverride: { version: 2, colors: { brand: "#00ff00" } },
      });

      expect(derived.colors["text-brand"]).toBe(
        METABASE_LIGHT_THEME.colors["text-brand"],
      );
    });

    it("leaves whitelabel filter and summarize ramps alone", () => {
      const derived = deriveFullMetabaseTheme({ colorScheme: "light" });

      expect(derived.colors["text-filter"]).toBe(
        METABASE_LIGHT_THEME.colors["text-filter"],
      );
    });
  });
});
