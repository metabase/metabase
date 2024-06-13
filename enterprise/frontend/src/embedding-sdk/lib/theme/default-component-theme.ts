import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import type { MantineThemeOverride } from "metabase/ui";

export const DEFAULT_SDK_FONT_SIZE = 14;

// Use em units to scale font sizes relative to the base font size.
// The em unit is used by default in the embedding SDK.
const units = (px: number) => ({
  px: `${px}px`,
  em: `${px / DEFAULT_SDK_FONT_SIZE}em`,
});

export const FONT_SIZES = {
  tableCell: units(12.5),
  label: units(12),
  goalLabel: units(14),
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
        backgroundColor: "var(--mb-color-bg-light)",
        hoverBackgroundColor: "var(--mb-color-brand)",
        hoverTextColor: "var(--mb-color-text-white)",
        textColor: "var(--mb-color-text-medium)",
      },
    },
  },
  dashboard: {
    backgroundColor: "var(--mb-color-bg-white)",
    card: {
      backgroundColor: "var(--mb-color-bg-white)",
    },
  },
  question: {
    backgroundColor: "transparent",
  },
  table: {
    cell: {
      fontSize: FONT_SIZES.tableCell.px,
      textColor: "text-dark",
    },
    idColumn: {
      textColor: "brand",
    },
  },
  pivotTable: {
    rowToggle: {
      textColor: "text-white",
      backgroundColor: "text-light", // TODO: should it be "bg-dark" ?
    },
  },
  cartesian: {
    label: { fontSize: FONT_SIZES.label.px },
    goalLine: {
      label: { fontSize: FONT_SIZES.goalLabel.px },
    },
  },
};

/**
 * Default theme options, with overrides specific to the
 * Embedding SDK environment to provide nicer defaults.
 */
export const DEFAULT_EMBEDDED_COMPONENT_THEME: MetabaseComponentTheme = merge<
  MetabaseComponentTheme,
  Partial<MetabaseComponentTheme>
>(DEFAULT_METABASE_COMPONENT_THEME, {
  table: {
    cell: {
      textColor: "text-primary",
      fontSize: FONT_SIZES.tableCell.em,
      backgroundColor: "bg-white",
    },
  },
  cartesian: {
    label: { fontSize: FONT_SIZES.label.em },
    goalLine: {
      label: { fontSize: FONT_SIZES.goalLabel.em },
    },
  },
  collectionBrowser: {
    breadcrumbs: {
      expandButton: {
        backgroundColor: "transparent",
        hoverBackgroundColor: "var(--mb-color-brand)",
        hoverTextColor: "var(--mb-color-text-white)",
        textColor: "var(--mb-color-text-medium)",
      },
    },
  },
});

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
