import { merge } from "icepick";

import { DEFAULT_FONT } from "embedding-sdk/config";
import { getEmbeddingChartColors } from "embedding-sdk/lib/theme/get-embedding-chart-colors";
import { colors } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

import type {
  MetabaseTheme,
  MetabaseColors,
  MetabaseColor,
  MetabaseComponentTheme,
} from "../../types/theme";
import type { EmbeddingThemeOverride } from "../../types/theme/private";

import { colorTuple } from "./color-tuple";
import { DEFAULT_EMBEDDED_COMPONENT_THEME } from "./default-component-theme";

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
  }

  return override;
}

const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<MappableSdkColor, ColorName> = {
  brand: "brand",
  border: "border",
  filter: "filter",
  summarize: "summarize",
  "text-primary": "text-dark",
  "text-secondary": "text-medium",
  "text-tertiary": "text-light",
  background: "bg-white",
  "background-hover": "bg-light",

  // shadow: "shadow",
  // positive: "success",
  // negative: "danger",
  // warning: "warning",

  // white
  // black
};

const originalColors = { ...colors };

export function getThemedColorsPalette(
  themeColors?: MetabaseColors,
): ColorPalette {
  if (!themeColors) {
    return originalColors;
  }

  const mappedThemeColors: ColorPalette = {};

  Object.entries(themeColors).forEach(([key, value]) => {
    const mappedKey = SDK_TO_MAIN_APP_COLORS_MAPPING[key as MappableSdkColor];

    // Some colors are not 1:1 mappable, ignore them.
    if (mappedKey) {
      mappedThemeColors[mappedKey] = value;
    }
  });

  // Map the chart colors
  if (themeColors.charts) {
    const mappedChartColors = getEmbeddingChartColors(themeColors.charts);

    Object.entries(mappedChartColors).forEach(([key, value]) => {
      mappedThemeColors[key as ColorName] = value;
    });
  }

  return {
    ...originalColors,
    ...mappedThemeColors,
  };
}
