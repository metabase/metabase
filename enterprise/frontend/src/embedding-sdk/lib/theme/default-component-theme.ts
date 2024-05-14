import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";

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
  DEFAULT_METABASE_COMPONENT_THEME,
  {
    table: {
      cell: {
        backgroundColor: "white",
      },
    },
  },
);
