import type {
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";

/**
 * Returns a new theme with only the settings that differ from the defaults.
 * Saved themes store all colors (including defaults), so we strip out
 * values that match the instance defaults to avoid overriding them needlessly.
 */
export function stripDefaultThemeSettings(
  themeSettings: MetabaseTheme,
  defaults: MetabaseTheme,
): MetabaseTheme {
  const result: MetabaseTheme = {};

  if (themeSettings.preset) {
    result.preset = themeSettings.preset;
  }
  if (themeSettings.fontSize) {
    result.fontSize = themeSettings.fontSize;
  }
  if (themeSettings.fontFamily) {
    result.fontFamily = themeSettings.fontFamily;
  }
  if (themeSettings.lineHeight) {
    result.lineHeight = themeSettings.lineHeight;
  }
  if (themeSettings.components) {
    result.components = themeSettings.components;
  }

  if (themeSettings.colors) {
    const defaultColors = defaults.colors ?? {};
    const nonDefaultColors: Partial<MetabaseColors> = {};

    for (const [key, value] of Object.entries(themeSettings.colors)) {
      if (key === "charts") {
        const defaultCharts = defaultColors.charts ?? [];
        const themeCharts = themeSettings.colors.charts ?? [];

        if (JSON.stringify(themeCharts) !== JSON.stringify(defaultCharts)) {
          nonDefaultColors.charts = themeCharts;
        }
        continue;
      }

      const defaultValue = defaultColors[key as keyof MetabaseColors];
      if (value !== defaultValue) {
        (nonDefaultColors as Record<string, unknown>)[key] = value;
      }
    }

    if (Object.keys(nonDefaultColors).length > 0) {
      result.colors = nonDefaultColors;
    }
  }

  return result;
}
