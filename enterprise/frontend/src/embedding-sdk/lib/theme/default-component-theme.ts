import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import type { MantineThemeOverride } from "metabase/ui";

const fromPx = (px: number) => ({ px: `${px}px`, em: `${px / 16}em` });

export const CHART_SIZES = {
  label: fromPx(12),
  goalLabel: fromPx(14),
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
  table: {
    cell: {
      fontSize: "12.5px",
      textColor: "text-dark",
    },
    idColumn: {
      textColor: "brand",
    },
  },
  pivotTable: {
    rowToggle: {
      textColor: "white",
      backgroundColor: "text-light",
    },
  },
  cartesian: {
    label: { fontSize: CHART_SIZES.label.px },
    goalLine: {
      label: { fontSize: CHART_SIZES.goalLabel.px },
    },
  },
};

/**
 * Default theme options, with overrides specific to the
 * Embedding SDK environment to provide nicer defaults.
 */
export const DEFAULT_EMBEDDED_COMPONENT_THEME: MetabaseComponentTheme = merge(
  DEFAULT_METABASE_COMPONENT_THEME,
  {
    table: {
      cell: {
        backgroundColor: "bg-white",
      },
    },

    // Apply em units to indicate that the font size
    // is relative to the base font size by default.
    cartesian: {
      label: { fontSize: CHART_SIZES.label.em },
      goalLine: {
        label: { fontSize: CHART_SIZES.goalLabel.em },
      },
    },
  },
);

export const EMBEDDING_SDK_COMPONENTS_OVERRIDES: MantineThemeOverride["components"] =
  {
    HoverCard: {
      defaultProps: {
        withinPortal: true,
        portalProps: {
          target: `#${EMBEDDING_SDK_ROOT_ELEMENT_ID}`,
        },
      },
    },
  };
