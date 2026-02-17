import type {
  ChartColorV2,
  MetabaseColorKey,
  ProtectedColorKey,
} from "metabase/lib/colors";

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
