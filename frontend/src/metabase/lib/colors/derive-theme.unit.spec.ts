import { METABASE_LIGHT_THEME } from "./constants/light";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { deriveFullMetabaseTheme } from "./derive-theme";

describe("deriveFullMetabaseTheme", () => {
  it("applies whitelabel colors over the base theme", () => {
    const derived = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
      whitelabelColors: { brand: "#ff0000" },
    });

    // The whitelabel color should override the base theme color
    expect(derived.colors["brand"]).toBe("#ff0000");

    // Other colors should remain from base theme
    expect(derived.colors["text-primary"]).toBe(
      METABASE_LIGHT_THEME.colors["text-primary"],
    );
  });

  it("applies user theme overrides over whitelabel colors", () => {
    const derived = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
      whitelabelColors: { brand: "#ff0000" },
      embeddingThemeOverride: { version: 2, colors: { brand: "#00ff00" } },
    });

    // User overrides takes precedence over instance whitelabel colors
    expect(derived.colors["brand"]).toBe("#00ff00");
  });

  it("filters out all internal colors from user overrides", () => {
    const derivedBaseLightTheme = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
    });

    const userColors: Record<string, string> = {};

    // Modular embedding user tries to override the protected colors
    for (const protectedColorKey of PROTECTED_COLORS) {
      userColors[protectedColorKey] = "#ff0000";
    }

    const derived = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
      embeddingThemeOverride: { version: 2, colors: userColors },
    });

    // All protected colors must remain unchanged
    for (const protectedColorKey of PROTECTED_COLORS) {
      expect(derived.colors[protectedColorKey]).toBe(
        derivedBaseLightTheme.colors[protectedColorKey],
      );
    }
  });

  it("transforms chartColors to accent colors", () => {
    const derived = deriveFullMetabaseTheme({
      baseTheme: METABASE_LIGHT_THEME,
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
