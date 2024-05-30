import type { MantineThemeOverride } from "@mantine/core";
import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";

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
    },
    idColumn: {
      textColor: "brand",
    },
  },
  cartesian: {
    label: {
      fontSize: "12px",
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

        // Makes the base font size relative to root embedding,
        // without affecting the Metabase app's font sizes.
        // SDK users can override this to set their label font sizes.
        fontSize: "0.893em",
      },
    },
    cartesian: {
      label: {
        fontSize: "0.857em",
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
