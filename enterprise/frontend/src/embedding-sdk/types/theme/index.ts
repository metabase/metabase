import type { ColorPalette } from "metabase/lib/colors/types";

import type { MetabaseFontFamily } from "../fonts";

/**
 * Theme configuration for embedded Metabase components.
 */
export interface MetabaseTheme {
  /** Base font size */
  fontSize?: string;

  /**
   * Base font family supported by Metabase.
   * Custom fonts are not yet supported in this version.
   **/
  fontFamily?: MetabaseFontFamily;

  /** Base line height */
  lineHeight?: string | number;

  /** Color palette */
  colors?: MetabaseColors;

  /** Component theme options */
  components?: MetabaseComponentTheme;
}

export type MetabaseColors = ColorPalette;

/**
 * Theme options for customizing specific Metabase
 * components and visualizations.
 */
export interface MetabaseComponentTheme {}
