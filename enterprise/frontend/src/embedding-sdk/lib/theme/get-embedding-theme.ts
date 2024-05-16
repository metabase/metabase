import { colors } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

import type {
  MetabaseTheme,
  MetabaseColors,
  MetabaseColor,
} from "../../types/theme";
import type { EmbeddingThemeOverride } from "../../types/theme/private";

import { colorTuple } from "./color-tuple";

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
): EmbeddingThemeOverride {
  const override: EmbeddingThemeOverride = {
    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),
    ...(theme.fontFamily && { fontFamily: theme.fontFamily }),

    other: {
      ...theme.components,
      ...(theme.fontSize && { fontSize: theme.fontSize }),
    },
  };

  if (theme.colors) {
    override.colors = {};

    // Apply color palette overrides
    for (const name in theme.colors) {
      const color = theme.colors[name as keyof MetabaseColors];

      if (color) {
        override.colors[name] = colorTuple(color);
      }
    }
  }

  return override;
}

const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<MetabaseColor, ColorName> = {
  brand: "brand",
  border: "border",
  filter: "filter",
  "text-primary": "text-dark",
  "text-secondary": "text-medium",
  "text-tertiary": "text-light",
  "background-white": "bg-white",
  "background-light": "bg-light",
};

const originalColors = { ...colors };

export function getThemedColorsPallete(
  themeColors?: MetabaseColors,
): ColorPalette {
  if (!themeColors) {
    return originalColors;
  }

  const mappedThemeColors: ColorPalette = {};

  Object.entries(themeColors).forEach(([key, value]) => {
    const mappedKey = SDK_TO_MAIN_APP_COLORS_MAPPING[key as MetabaseColor];
    mappedThemeColors[mappedKey] = value;
  });

  return {
    ...mappedThemeColors,
    ...originalColors,
  };
}
