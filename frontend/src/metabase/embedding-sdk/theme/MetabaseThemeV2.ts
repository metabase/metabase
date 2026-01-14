import type {
  ChartColorV2,
  InternalColorKey,
  MetabaseColorV2,
} from "metabase/lib/colors/theme";

// SDK-exposed colors (excludes internal colors like metabase-brand)
export type MetabaseEmbedColorV2 = Exclude<MetabaseColorV2, InternalColorKey>;

/**
 * V2 theme configuration for embedded Metabase components.
 *
 * Unlike V1, this uses the same color keys as the main Metabase app,
 * eliminating the need for SDK-specific color mapping.
 */
export interface MetabaseEmbedThemeV2 {
  /**
   * Theme version - must be 2 for V2 themes.
   */
  version: 2;

  /**
   * Color overrides using the same keys as the main Metabase app.
   * Internal colors like `metabase-brand` are excluded.
   */
  colors?: Partial<Record<MetabaseEmbedColorV2, string>>;

  /**
   * Chart colors for visualizations.
   * Each color can be a string or an object with base/tint/shade.
   */
  chartColors?: ChartColorV2[];
}
