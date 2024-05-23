import { merge } from "icepick";

import { DEFAULT_FONT } from "embedding-sdk/config";
import { getEmbeddingChartColors } from "embedding-sdk/lib/theme/get-embedding-chart-colors";
import { colors } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

import type {
  MetabaseTheme,
  MetabaseColor,
  MetabaseComponentTheme,
} from "../../types/theme";
import type { EmbeddingThemeOverride } from "../../types/theme/private";

import { colorTuple } from "./color-tuple";
import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  EMBEDDING_SDK_COMPONENTS_OVERRIDES,
} from "./default-component-theme";

// Exclude sdk colors that are not 1:1 mappable.
type MappableSdkColor = Exclude<MetabaseColor, "charts">;

const getFontFamily = (theme: MetabaseTheme) =>
  theme.fontFamily ?? DEFAULT_FONT;

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
): EmbeddingThemeOverride {
  const components: MetabaseComponentTheme = merge(
    DEFAULT_EMBEDDED_COMPONENT_THEME,
    theme.components,
  );

  const override: EmbeddingThemeOverride = {
    fontFamily: getFontFamily(theme),

    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),

    other: {
      ...components,
      ...(theme.fontSize && { fontSize: theme.fontSize }),
    },

    components: EMBEDDING_SDK_COMPONENTS_OVERRIDES,
  };

  if (theme.colors) {
    override.colors = {};

    // Apply color palette overrides
    for (const name in theme.colors) {
      const color = theme.colors[name as MetabaseColor];

      if (color && typeof color === "string") {
        const themeColorName =
          SDK_TO_MAIN_APP_COLORS_MAPPING[name as MappableSdkColor];

        override.colors[themeColorName] = colorTuple(color);
      }
    }

    if (theme.colors.charts) {
      const mappedChartColors = getEmbeddingChartColors(theme.colors.charts);

      for (const [key, value] of Object.entries(mappedChartColors)) {
        if (value) {
          override.colors[key] = colorTuple(value);
        }
      }
    }
  }

  return override;
}
