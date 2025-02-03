import type { CSSProperties } from "react";

import type { ColorName } from "metabase/lib/colors/types";

import type { DeepPartial } from "../types/utils";

import type { MetabaseFontFamily } from "./fonts";

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
   * Font family that will be used for all text, it defaults to the instance's default font.
   **/
  // eslint-disable-next-line @typescript-eslint/ban-types -- this is needed to allow any string but keep autocomplete for the built-in ones
  fontFamily?: MetabaseFontFamily | (string & {});

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

  /** Lighter variation of the brand color. Used for hover and accented elements. */
  "brand-hover"?: string;

  /** Lightest variation of the brand color. Used for hover and accented elements. */
  "brand-hover-light"?: string;

  /** Text color on dark elements. Should be a lighter color for readability. */
  "text-primary"?: string;

  /** Lighter variation of dark text on light elements. */
  "text-secondary"?: string;

  /** Text color on light elements. Should be a darker color for readability. */
  "text-tertiary"?: string;

  /** Default background color. */
  background?: string;

  /** Slightly muted background color. */
  "background-secondary"?: string;

  /** Slightly darker background color used for hover and accented elements. */
  "background-hover"?: string;

  /** Muted background color used for disabled elements, such as disabled buttons and inputs. */
  "background-disabled"?: string;

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
export type MetabaseComponentTheme = {
  dashboard: {
    backgroundColor: string;

    /**
     * Border color of the dashboard grid, shown only when editing dashboards.
     * Defaults to `colors.border`
     **/
    gridBorderColor?: string;

    card: {
      backgroundColor: string;

      /**
       * Add custom borders to dashboard cards when set.
       * Value is the same as the border property in CSS, such as "1px solid #ff0000".
       * This will replace the card's drop shadow.
       **/
      border?: string;
    };
  };

  question: {
    backgroundColor: string;
  };

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
    cell: {
      /** Font size of cell values, defaults to ~12px */
      fontSize: string;
    };

    /** Button to toggle pivot table rows */
    rowToggle: {
      textColor: string;
      backgroundColor: string;
    };
  };

  /** Number chart */
  number?: {
    /**
     * Value displayed on number charts.
     * This also applies to the primary value in trend charts.
     **/
    value?: {
      fontSize?: CSSProperties["fontSize"];
      lineHeight?: string;
    };
  };

  /** Cartesian charts */
  cartesian: {
    /** Padding around the chart. */
    padding?: string;

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

  /** Tooltip */
  tooltip?: {
    /** Tooltip text color. */
    textColor?: string;

    /** Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes. */
    secondaryTextColor?: string;

    /** Tooltip background color. */
    backgroundColor?: string;

    /** Tooltip background color for focused rows. */
    focusedBackgroundColor?: string;
  };

  /** Popover */
  popover: {
    /** z-index of overlays. Useful for embedding components in a modal.
     * Defaults to 200. */
    zIndex?: number;
  };

  collectionBrowser: {
    breadcrumbs: {
      expandButton: {
        backgroundColor: ColorCssVariableOrString;
        hoverBackgroundColor: ColorCssVariableOrString;
        textColor: ColorCssVariableOrString;
        hoverTextColor: ColorCssVariableOrString;
      };
    };
    emptyContent: {
      icon: {
        width: CSSProperties["width"];
        height: CSSProperties["width"];
      };
      title: {
        fontSize: CSSProperties["fontSize"];
      };
      subtitle: {
        fontSize: CSSProperties["fontSize"];
      };
    };
  };
};

type ColorCssVariableOrString = `var(--mb-color-${ColorName})` | string;

export type ChartColor =
  | string
  | {
      base: string;

      /** Lighter variation of the base color */
      tint?: string;

      /** Darker variation of the base color */
      shade?: string;
    };
