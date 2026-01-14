export type { MetabaseColorKey, MetabaseThemeV2, ChartColorV2 } from "./theme";
import type { ChartColorV2, MetabaseColorKey } from "./theme";

// Backward-compatible aliases
export type ColorPalette = Partial<Record<MetabaseColorKey, string>>;
export type ColorName = MetabaseColorKey;

/** @deprecated Use MetabaseColorKey instead */
export type MetabaseColorV2 = MetabaseColorKey;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
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
