import { merge } from "icepick";

import { DEFAULT_FONT } from "embedding-sdk/config";
import type { MantineThemeOverride } from "metabase/ui";

import type {
  MetabaseColor,
  MetabaseComponentTheme,
  MetabaseTheme,
} from "../../types/theme";

import { colorTuple } from "./color-tuple";
import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  DEFAULT_SDK_FONT_SIZE,
  getEmbeddingComponentOverrides,
} from "./default-component-theme";
import type { MappableSdkColor } from "./embedding-color-palette";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "./embedding-color-palette";

const SDK_BASE_FONT_SIZE = `${DEFAULT_SDK_FONT_SIZE}px`;

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
  font?: string,
): MantineThemeOverride {
  const components: MetabaseComponentTheme = merge(
    DEFAULT_EMBEDDED_COMPONENT_THEME,
    theme.components,
  );

  const override: MantineThemeOverride = {
    fontFamily: theme.fontFamily ?? font ?? DEFAULT_FONT,

    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),

    other: {
      ...components,
      fontSize: theme.fontSize ?? SDK_BASE_FONT_SIZE,
    },

    components: getEmbeddingComponentOverrides(theme.components),
  };

  if (theme.colors) {
    override.colors = {};

    // Apply color palette overrides
    for (const name in theme.colors) {
      const color = theme.colors[name as MetabaseColor];

      if (color && typeof color === "string") {
        const themeColorNames =
          SDK_TO_MAIN_APP_COLORS_MAPPING[name as MappableSdkColor];

        for (const themeColorName of themeColorNames) {
          override.colors[themeColorName] = colorTuple(color);
        }
      }
    }
  }

  return override;
}
