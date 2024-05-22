import type { MetabaseColor, MetabaseColors } from "embedding-sdk/types/theme";
import { colors } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

export const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<MetabaseColor, ColorName> =
  {
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
    const mappedKey = SDK_TO_MAIN_APP_COLORS_MAPPING[key as MetabaseColor];
    mappedThemeColors[mappedKey] = value;
  });

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
