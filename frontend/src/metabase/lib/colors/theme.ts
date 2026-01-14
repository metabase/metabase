import type { ColorSettings } from "metabase-types/api/settings";

import { colorConfig } from "./colors";
import { INTERNAL_COLORS, type MetabaseColorV2 } from "./constants";

// Re-export from constants for backward compatibility
export {
  INTERNAL_COLORS,
  type InternalColorKey,
  type MetabaseColorV2,
} from "./constants";

// Base V2 theme interface
export interface MetabaseThemeV2 {
  version: 2;
  colors: Record<MetabaseColorV2, string>;
  chartColors?: ChartColorV2[];
}

// Chart color type - same structure as V1
export type ChartColorV2 =
  | string
  | {
      base: string;
      tint?: string;
      shade?: string;
    };

// Generate base theme from colorConfig
function createTheme(mode: "light" | "dark"): MetabaseThemeV2 {
  return {
    version: 2,
    colors: Object.fromEntries(
      Object.entries(colorConfig).map(([key, value]) => [key, value[mode]]),
    ) as Record<MetabaseColorV2, string>,
  };
}

export const METABASE_LIGHT_THEME = createTheme("light");
export const METABASE_DARK_THEME = createTheme("dark");

// Helper for runtime theme selection
export function getThemeV2(colorScheme: "light" | "dark"): MetabaseThemeV2 {
  return colorScheme === "dark" ? METABASE_DARK_THEME : METABASE_LIGHT_THEME;
}

/**
 * User-provided theme overrides. Colors are partial since users only
 * need to specify the colors they want to change.
 */
export interface UserThemeOverride {
  version?: 2;
  colors?: Partial<Record<string, string>>;
  chartColors?: ChartColorV2[];
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
