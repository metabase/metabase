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
  "text-dark"?: string;

  /** Text color on light elements. Should be a darker color for readability. */
  "text-light"?: string;
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
      /** Default text color of table cells */
      textColor?: string;

      /** Default background color of table cells */
      backgroundColor?: string;
    };

    idColumn?: {
      /** Text color of table header. This defaults to the brand color. */
      textColor?: string;

      /** Default background color of ID column pill */
      backgroundColor?: string;
    };

    header?: {
      /** Text color of table header. This defaults to the brand color. */
      textColor?: string;

      /** Background color of table header */
      backgroundColor?: string;
    };
  };
}
