import type { MetabaseAccentColorKey, MetabaseColorKey } from "./color-keys";

/**
 * A complete Metabase theme definition.
 *
 * - `colors` contains all color keys
 * - `chartColors` contains chart color definitions
 */
export interface MetabaseThemeV2 {
  version: 2;

  colors: Record<MetabaseColorKeyWithoutAccents, string>;
  chartColors: ChartColorV2[];
}

/**
 * A fully derived theme with all color values filled in.
 * This is the output of `deriveFullMetabaseTheme`.
 */
export interface MetabaseDerivedThemeV2 {
  version: 2;

  colors: Record<MetabaseColorKey, string>;
}

/** Lets users define chart colors. */
export type ChartColorV2 =
  | string
  | { base: string; tint?: string; shade?: string };

/**
 * Metabase color keys without accent0 - accent7.
 * Those will be transformed from `chartColors`.
 */
type MetabaseColorKeyWithoutAccents = Exclude<
  MetabaseColorKey,
  MetabaseAccentColorKey
>;
