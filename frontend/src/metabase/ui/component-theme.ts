import type { CSSProperties } from "react";

import { OVERLAY_Z_INDEX } from "metabase/css/core/overlays/constants";
import type { ColorName } from "metabase/ui/colors/types";

/**
 * @inline
 */
export type ColorCssVariableOrString = `var(--mb-color-${ColorName})` | string;

export type ChartColor =
  | string
  | {
      base: string;

      /** Lighter variation of the base color */
      tint?: string;

      /** Darker variation of the base color */
      shade?: string;
    };

/**
 * Theme options for customizing specific Metabase
 * components and visualizations.
 *
 * @privateRemarks
 * Every non-optional properties here must have a default value defined
 * in DEFAULT_METABASE_COMPONENT_THEME below.
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
    /** Background color for all questions */
    backgroundColor: string;

    /** Toolbar of the default interactive question layout */
    toolbar?: {
      backgroundColor?: string;
    };
  };

  /** Data tables **/
  table: {
    /** Background color of the table header that stays fixed while scrolling. Defaults to `white` if no cell background color is set */
    stickyBackgroundColor?: string;

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

    splitLine: {
      lineStyle: {
        color: string;
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

const DEFAULT_SDK_FONT_SIZE = 14;

// Use em units to scale font sizes relative to the base font size.
const units = (px: number) => ({
  px: `${px}px`,
  em: `${px / DEFAULT_SDK_FONT_SIZE}em`,
});

const FONT_SIZES = {
  tableCell: units(12.5),
  pivotTableCell: units(12),
  label: units(13),
  goalLabel: units(13),
};

/**
 * Default theme options for Metabase components.
 *
 * While these theme options are primarily used by the React Embedding SDK
 * to provide extra customization for SDK users,
 * the options below are used to provide default values to components
 * such as charts, data tables and popovers.
 */
export const DEFAULT_METABASE_COMPONENT_THEME: MetabaseComponentTheme = {
  collectionBrowser: {
    breadcrumbs: {
      expandButton: {
        textColor: "var(--mb-color-text-secondary)",
        backgroundColor: "var(--mb-color-background-secondary)",
        hoverTextColor: "var(--mb-color-text-primary-inverse)",
        hoverBackgroundColor: "var(--mb-color-brand)",
      },
    },
    emptyContent: {
      icon: {
        width: "117",
        height: "94",
      },
      title: {
        fontSize: "1.5rem",
      },
      subtitle: {
        fontSize: "1rem",
      },
    },
  },
  dashboard: {
    backgroundColor: "var(--mb-color-background-primary)",
    card: {
      backgroundColor: "var(--mb-color-background-primary)",
    },
  },
  question: {
    backgroundColor: "transparent",
  },

  table: {
    cell: {
      fontSize: FONT_SIZES.tableCell.px,
      textColor: "var(--mb-color-text-primary)",
    },
    idColumn: {
      textColor: "var(--mb-color-brand)",
    },
  },
  pivotTable: {
    cell: {
      fontSize: FONT_SIZES.pivotTableCell.px,
    },
    rowToggle: {
      textColor: "text-primary-inverse",
      backgroundColor: "text-tertiary", // TODO: should it be "background-tertiary-inverse" ?
    },
  },
  cartesian: {
    label: { fontSize: FONT_SIZES.label.px },
    goalLine: {
      label: { fontSize: FONT_SIZES.goalLabel.px },
    },
    splitLine: {
      lineStyle: {
        color: "var(--mb-color-cartesian-grid-line)",
      },
    },
  },
  popover: {
    zIndex: OVERLAY_Z_INDEX,
  },
};
