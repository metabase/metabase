import type { ColorSettings } from "metabase-types/api/settings";

import { METABASE_DARK_THEME } from "./constants/dark";
import { METABASE_LIGHT_THEME } from "./constants/light";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import type {
  MetabaseColorKey,
  MetabaseThemeV2,
  UserThemeOverride,
} from "./types";

export const getThemeFromColorScheme = (
  colorScheme: "light" | "dark",
): MetabaseThemeV2 =>
  colorScheme === "dark" ? METABASE_DARK_THEME : METABASE_LIGHT_THEME;

/**
 * Universal theme resolution with layered overrides.
 * Priority: userThemeOverride > whitelabelColors > baseTheme
 *
 * Used by both main app and SDK - no embedding-specific logic needed.
 */
interface ThemeOverrideOptions {
  baseTheme: MetabaseThemeV2;
  whitelabelColors?: ColorSettings;
  userThemeOverride?: UserThemeOverride;
}

export function resolveTheme(options: ThemeOverrideOptions): MetabaseThemeV2 {
  const { baseTheme, whitelabelColors, userThemeOverride } = options;

  // Filter out protected colors from user override (e.g. metabase-brand)
  const filteredUserColors = userThemeOverride?.colors
    ? Object.fromEntries(
        Object.entries(userThemeOverride.colors).filter(
          ([key]) =>
            !PROTECTED_COLORS.includes(
              key as (typeof PROTECTED_COLORS)[number],
            ),
        ),
      )
    : undefined;

  return {
    version: 2,
    colors: {
      ...baseTheme.colors,
      ...whitelabelColors,
      ...filteredUserColors,
    } as Record<MetabaseColorKey, string>,
    chartColors: userThemeOverride?.chartColors,
  };
}
