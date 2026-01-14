import type {
  ChartColorV2,
  MetabaseColorKey,
  ProtectedColorKey,
} from "metabase/lib/colors";

/**
 * Color keys exposed to modular embedding.
 * Excludes colors that should not be exposed such as admin colors.
 */
export type MetabaseEmbeddingColorKeyV2 = Exclude<
  MetabaseColorKey,
  ProtectedColorKey
>;

/**
 * V2 theme configuration for embedded Metabase components.
 *
 * Unlike V1, this uses the same color keys as the main Metabase app,
 * eliminating the need for SDK-specific color mapping.
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
