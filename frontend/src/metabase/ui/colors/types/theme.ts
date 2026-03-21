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

/**
 * Chart color definition for V2 themes.
 *
 * Can be a simple color string or an object with base/tint/shade variants.
 *
 * @category Theming
 */
export type ChartColorV2 =
  | string
  | {
      base: string;

      /** Lighter variation of the base color */
      tint?: string;

      /** Darker variation of the base color */
      shade?: string;
    }
  | null;

/**
 * Metabase color keys without accent0 - accent7.
 * Those will be transformed from `chartColors`.
 */
type MetabaseColorKeyWithoutAccents = Exclude<
  MetabaseColorKey,
  MetabaseAccentColorKey
>;
