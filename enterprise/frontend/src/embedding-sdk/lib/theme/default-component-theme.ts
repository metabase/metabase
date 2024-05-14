import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";

/**
 * Default theme options for components.
 */
export const DEFAULT_COMPONENT_THEME: MetabaseComponentTheme = {
  table: {
    cell: {
      textColor: "text-brand",
    },
    idColumn: {
      textColor: "brand",
    },
  },
};

/**
 * Default theme options, with overrides specific to the
 * Embedding SDK environment to provide nicer defaults.
 */
export const DEFAULT_EMBEDDED_COMPONENT_THEME: MetabaseComponentTheme = merge(
  DEFAULT_COMPONENT_THEME,
  {
    table: {
      cell: {
        backgroundColor: "white",
      },
    },
  },
);
