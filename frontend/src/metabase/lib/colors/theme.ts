import type { ColorSettings } from "metabase-types/api/settings";

import { INTERNAL_COLORS, type MetabaseColorV2 } from "./constants";
import { METABASE_DARK_THEME } from "./dark";
import { METABASE_LIGHT_THEME } from "./light";
import type { MetabaseThemeV2, UserThemeOverride } from "./types";

// Re-export from constants for backward compatibility
export {
  INTERNAL_COLORS,
  type InternalColorKey,
  type MetabaseColorV2,
} from "./constants";

// Re-export theme constants
export { METABASE_DARK_THEME } from "./dark";
export { METABASE_LIGHT_THEME } from "./light";

// Re-export types
export type { ChartColorV2, MetabaseThemeV2, UserThemeOverride } from "./types";

// Helper for runtime theme selection
export function getThemeV2(colorScheme: "light" | "dark"): MetabaseThemeV2 {
  return colorScheme === "dark" ? METABASE_DARK_THEME : METABASE_LIGHT_THEME;
}

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

  // Filter out internal colors from user override (e.g., metabase-brand)
  const filteredUserColors = userThemeOverride?.colors
    ? Object.fromEntries(
        Object.entries(userThemeOverride.colors).filter(
          ([key]) =>
            !INTERNAL_COLORS.includes(key as (typeof INTERNAL_COLORS)[number]),
        ),
      )
    : undefined;

  return {
    version: 2,
    colors: {
      ...baseTheme.colors,
      ...whitelabelColors,
      ...filteredUserColors,
    } as Record<MetabaseColorV2, string>,
    chartColors: userThemeOverride?.chartColors,
  };
}
