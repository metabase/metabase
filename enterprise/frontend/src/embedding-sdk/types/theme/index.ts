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

export interface MetabaseColors {
  /** Primary brand color */
  brand?: string;

  /** Text color on dark elements. Should be a lighter color for readability. */
  "text-primary"?: string;

  /** Lighter variation of dark text on light elements. */
  "text-secondary"?: string;

  /** Text color on light elements. Should be a darker color for readability. */
  "text-tertiary"?: string;

  /** Default background color. */
  "background-white"?: string;

  /** Darker background color for accented elements. */
  "background-light"?: string;

  /** Color used for borders */
  border?: string;

  /** Color used for filters context */
  filter?: string;
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

      /** Default background color of cells, defaults to `white` */
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
