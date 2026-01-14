import type { MetabaseColorKey } from "./color-keys";

/**
 * A complete Metabase V2 theme with all color values defined.
 */
export interface MetabaseThemeV2 {
  version: 2;
  colors: Record<MetabaseColorKey, string>;
  chartColors?: ChartColorV2[];
}

/**
 * Lets users define chart colors.
 */
export type ChartColorV2 =
  | string
  | { base: string; tint?: string; shade?: string };

export type { MetabaseColorKey } from "./color-keys";
