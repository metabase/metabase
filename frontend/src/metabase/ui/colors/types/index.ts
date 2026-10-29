export type {
  ChartColorV2,
  MetabaseThemeV2,
  MetabaseDerivedThemeV2,
} from "./theme";

import type { MetabaseColorKey, ProtectedColorKey } from "./color-keys";
import type { ChartColorV2 } from "./theme";

/**
 * Color values keyed by color token name (`core-brand`, `text-primary`, `accent0`, …).
 * A palette can be partial: missing tokens fall back to the theme defaults.
 *
 * Do not pass the raw `application-colors` setting (`ColorSettings`) as a palette.
 * Its `brand`, `filter` and `summarize` keys are not token names, so convert it
 * with `mapWhitelabelColorsToTokens` first. The `never` keys make TypeScript
 * reject the raw setting here.
 */
export type ColorPalette = Partial<Record<MetabaseColorKey, string>> & {
  brand?: never;
  filter?: never;
  summarize?: never;
};
export type ColorName = MetabaseColorKey;
export type ColorGetter = (colorName: string) => string;

/**
 * Color keys available for theming in modular embedding.
 *
 * Excludes protected colors such as admin colors that should not be exposed.
 *
 * @inline
 */
export type MetabaseEmbeddingColorKeyV2 = Exclude<
  MetabaseColorKey,
  ProtectedColorKey
>;

/**
 * Version 2 theme configuration for embedded Metabase components.
 *
 * @category Theming
 */
export interface MetabaseEmbeddingThemeV2 {
  /** Theme version must be 2 for version 2 themes. */
  version: 2;

  /** Color overrides. */
  colors?: Partial<Record<MetabaseEmbeddingColorKeyV2, string>>;

  /**
   * Chart colors overrides.
   * Each color can be a string or an object with base/tint/shade.
   */
  chartColors?: ChartColorV2[];
}

export type * from "./color-keys";
export type * from "./accent-color-options";
