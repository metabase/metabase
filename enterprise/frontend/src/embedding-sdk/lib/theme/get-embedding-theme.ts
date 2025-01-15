import { merge } from "icepick";

import { DEFAULT_FONT } from "embedding-sdk/config";
import type {
  MetabaseColor,
  MetabaseComponentTheme,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  DEFAULT_SDK_FONT_SIZE,
  getEmbeddingComponentOverrides,
} from "metabase/embedding-sdk/theme";
import type { MappableSdkColor } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { MantineThemeOverride } from "metabase/ui";

import { colorTuple } from "./color-tuple";

const SDK_BASE_FONT_SIZE = `${DEFAULT_SDK_FONT_SIZE}px`;

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
  font: string | undefined,
): MantineThemeOverride {
  const components: MetabaseComponentTheme = merge(
    DEFAULT_EMBEDDED_COMPONENT_THEME,
    theme.components,
  );

  const override: MantineThemeOverride = {
    // font is coming from either redux, where we store theme.fontFamily,
    // or from the instance settings, we're adding a default to be used while loading the settings
    fontFamily: font ?? DEFAULT_FONT,

    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),

    other: {
      ...components,
      fontSize: theme.fontSize ?? SDK_BASE_FONT_SIZE,
    },

    components: getEmbeddingComponentOverrides(),
  };

  if (theme.colors) {
    override.colors = {};

    // Apply color palette overrides
    for (const name in theme.colors) {
      const color = theme.colors[name as MetabaseColor];

      if (color && typeof color === "string") {
        const themeColorNames =
          SDK_TO_MAIN_APP_COLORS_MAPPING[name as MappableSdkColor];

        // If the sdk color does not exist in the mapping, skip it.
        if (!themeColorNames) {
          console.warn(
            `Color ${name} does not exist in the Embedding SDK. Please remove it from the theme configuration.`,
          );

          continue;
        }

        for (const themeColorName of themeColorNames) {
          override.colors[themeColorName] = colorTuple(color);
        }
      }
    }
  }

  return override;
}
