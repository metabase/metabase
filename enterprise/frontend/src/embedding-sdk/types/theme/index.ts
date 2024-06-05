import type { MetabaseFontFamily } from "../fonts";
import type { DeepPartial } from "../utils";

/**
 * Theme configuration for embedded Metabase components.
 */
export interface MetabaseTheme {
  /**
   * Base font size.
   * Supported units are px, em and rem.
   * Defaults to ~14px (0.875em)
   **/
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
  components?: DeepPartial<MetabaseComponentTheme>;
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

  /** Background color for dashboards. Defaults to `background`. */
  "background-dashboard"?: string;

  /** Background color for dashboard cards. Defaults to `background`. */
  "background-dashboard-card"?: string;

  /** Background color for visualizations. Unset by default. */
  "background-visualization"?: string;

  /** Color used for borders */
  border?: string;

  /** Color used for popover shadows */
  shadow?: string;

  /** Color used for filters context */
  filter?: string;

  /** Color used for aggregations and breakouts context */
  summarize?: string;

  /** Chart colors */
  charts?: ChartColor[];

  /** Color used to indicate successful actions and positive values/trends */
  positive?: string;

  /** Color used to indicate dangerous actions and negative values/trends */
  negative?: string;
}

export type MetabaseColor = keyof MetabaseColors;

/**
 * Theme options for customizing specific Metabase
 * components and visualizations.
 *
 * Every non-optional properties here must have a default value defined
 * in DEFAULT_METABASE_COMPONENT_THEME at [default-component-theme.ts]
 */
export interface MetabaseComponentTheme {
  /** Data tables **/
  table: {
    cell: {
      /** Text color of cells, defaults to `text-primary`. */
      textColor: string;

      /** Default background color of cells, defaults to `background` */
      backgroundColor?: string;

      /** Font size of cell values, defaults to ~12.5px */
      fontSize: string;
    };

    idColumn?: {
      /** Text color of ID column, defaults to `brand`. */
      textColor: string;

      /** Background color of ID column, defaults to `lighten(brand)`  */
      backgroundColor?: string;
    };
  };

  /** Pivot table **/
  pivotTable: {
    /** Button to toggle pivot table rows */
    rowToggle: {
      textColor: string;
      backgroundColor: string;
    };
  };

  /** Numerical value display */
  scalar?: {
    /** The primary numerical value */
    value?: {
      fontSize?: string;
      lineHeight?: string;
    };
  };

  /** Cartesian charts */
  cartesian: {
    label: {
      /** Labels used in cartesian charts, such as axis ticks and series. */
      fontSize: string;
    };

    goalLine: {
      label: {
        /** Font size of goal line labels */
        fontSize: string;
      };
    };
  };
}

export type ChartColor =
  | string
  | {
      base: string;

      /** Lighter variation of the base color */
      tint?: string;

      /** Darker variation of the base color */
      shade?: string;
    };
