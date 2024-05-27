import type { MetabaseColor, MetabaseColors } from "embedding-sdk/types/theme";
import { colors } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

import { getEmbeddingChartColors } from "./get-embedding-chart-colors";

/**
 * Define SDK colors that can be mapped 1:1 to the main app colors.
 *
 * Every color defined in `lib/colors` can be mapped here. However,
 * we do define a custom public interface for some colors,
 * such as chart colors, which needs to be excluded here.
 */
export type MappableSdkColor = Exclude<MetabaseColor, "charts">;

export const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<
  MappableSdkColor,
  ColorName
> = {
  brand: "brand",
  border: "border",
  filter: "filter",
  summarize: "summarize",
  "text-primary": "text-dark",
  "text-secondary": "text-medium",
  "text-tertiary": "text-light",
  background: "bg-white",
  "background-hover": "bg-light",
  shadow: "shadow",

  // positive: "success",
  // negative: "danger",
  // warning: "warning",

  // white
  // black
};

const originalColors = { ...colors };

/**
 * @param sdkColors color overrides from the SDK theme
 * @param appPalette color palette from the admin appearance settings
 */
export function getEmbeddingColorPalette(
  sdkColors?: MetabaseColors,
  appPalette?: ColorPalette,
): ColorPalette {
  if (!sdkColors) {
    return originalColors;
  }

  const mappedThemeColors: ColorPalette = {};

  Object.entries(sdkColors).forEach(([key, value]) => {
    const mappedKey = SDK_TO_MAIN_APP_COLORS_MAPPING[key as MappableSdkColor];

    // Some colors are not 1:1 mappable, ignore them.
    if (mappedKey) {
      mappedThemeColors[mappedKey] = value;
    }
  });

  // Map the chart colors
  if (sdkColors.charts) {
    const mappedChartColors = getEmbeddingChartColors(sdkColors.charts);

    Object.entries(mappedChartColors).forEach(([key, value]) => {
      mappedThemeColors[key as ColorName] = value;
    });
  }

  return {
    ...originalColors,
    ...appPalette,
    ...mappedThemeColors,
  };
}

/**
 * !! Mutate the global colors object to apply the new colors.
 *
 * @param sdkColors color overrides from the SDK theme
 * @param appPalette color palette from the admin appearance settings
 */
export function setGlobalEmbeddingColors(
  sdkColors?: MetabaseColors,
  appPalette?: ColorPalette,
) {
  const combinedThemeColors = getEmbeddingColorPalette(sdkColors, appPalette);

  Object.entries(combinedThemeColors).forEach(([key, value]) => {
    colors[key as ColorName] = value;
  });
}
