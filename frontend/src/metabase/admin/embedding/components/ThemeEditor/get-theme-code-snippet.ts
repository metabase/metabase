import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

/**
 * Serializes the theme settings into a JSON snippet that can be pasted into an
 * embedding config (e.g. `defineMetabaseConfig({ theme: ... })` or
 * `<MetabaseProvider config={{ theme: ... }} />`). Empty color values are
 * stripped so the snippet stays focused on what the admin actually configured.
 */
export function getThemeCodeSnippet(settings: MetabaseTheme): string {
  return JSON.stringify(stripEmptyColors(settings), null, 2);
}

function stripEmptyColors(settings: MetabaseTheme): MetabaseTheme {
  if (!settings.colors) {
    return settings;
  }

  const cleanedColors = Object.fromEntries(
    Object.entries(settings.colors).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== "" && value != null;
    }),
  );

  if (Object.keys(cleanedColors).length === 0) {
    const { colors: _omit, ...rest } = settings;
    return rest;
  }
  return { ...settings, colors: cleanedColors as MetabaseTheme["colors"] };
}
