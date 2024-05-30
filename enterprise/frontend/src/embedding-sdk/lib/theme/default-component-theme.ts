import type { MantineThemeOverride } from "@mantine/core";
import { merge } from "icepick";

import type { MetabaseComponentTheme } from "embedding-sdk";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import type { DeepPartial } from "embedding-sdk/types/utils";

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
    label: {
      fontSize: 12,
    },
    goalLine: {
      label: {
        fontSize: 14,
      },
    },
  },
};

/**
 * Theme overrides that are specific to the embedding SDK environment.
 */
export const EMBEDDING_COMPONENT_THEME_OVERRIDES: DeepPartial<MetabaseComponentTheme> =
  {
    table: {
      cell: {
        backgroundColor: "bg-white",
      },
    },
  };

/**
 * Default theme options with overrides specific to the
 * embedding SDK environment to provide nicer defaults.
 */
export const DEFAULT_EMBEDDED_COMPONENT_THEME: MetabaseComponentTheme = merge(
  DEFAULT_METABASE_COMPONENT_THEME,
  EMBEDDING_COMPONENT_THEME_OVERRIDES,
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
