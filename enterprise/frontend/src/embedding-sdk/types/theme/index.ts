import type { MetabaseFontFamily } from "../fonts";

/**
 * Theme configuration for embedded Metabase components.
 */
export interface MetabaseTheme {
  /** Base font size */
  fontSize?: string;

  /**
   * Base font family supported by Metabase, defaults to `Lato`.
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

export interface MetabaseColors {
  /** Primary brand color used for buttons and links */
  brand?: string;

  /** Text color on dark elements. Should be a lighter color for readability. */
  "text-primary"?: string;

  /** Lighter variation of dark text on light elements. */
  "text-secondary"?: string;

  /** Text color on light elements. Should be a darker color for readability. */
  "text-tertiary"?: string;

  /** Default background color. */
  background?: string;

  /** Slightly darker background color used for hover and accented elements. */
  "background-hover"?: string;

  /** Color used for borders */
  border?: string;

  /** Color used for popover shadows */
  shadow?: string;

  /** Color used for filters context */
  filter?: string;

  /** Color used for aggregations and breakouts context */
  summarize?: string;
}

export type MetabaseColor = keyof MetabaseColors;

/**
 * Theme options for customizing specific Metabase
 * components and visualizations.
 */
export interface MetabaseComponentTheme {
  /** Data tables **/
  table?: {
    cell?: {
      /** Text color of cells, defaults to `text-dark`. */
      textColor?: string;

      /** Default background color of cells, defaults to `bg-white` */
      backgroundColor?: string;
    };

    idColumn?: {
      /** Text color of ID column, defaults to `brand`. */
      textColor?: string;

      /** Background color of ID column, defaults to `lighten(brand)`  */
      backgroundColor?: string;
    };
  };
}
