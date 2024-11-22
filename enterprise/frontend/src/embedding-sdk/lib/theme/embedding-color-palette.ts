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

type NEW_SEMANTIC_COLOR =
  | "text-primary"
  | "text-secondary"
  | "text-tertiary"
  | "text-selected"
  | "text-brand"
  | "text-white"
  | "background"
  | "background-selected"
  | "background-disabled"
  | "background-inverse"
  | "background-brand"
  | "brand-light"
  | "brand-lighter";

/**
 * Mapping of SDK colors to main app colors. There could be additional values
 * for new semantic colors we add to colors.module.css
 */
export const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<
  MappableSdkColor,
  (ColorName | NEW_SEMANTIC_COLOR)[]
> = {
  brand: ["brand"],
  "brand-hover": ["brand-light"],
  "brand-hover-light": ["brand-lighter"],
  border: ["border"],
  filter: ["filter"],
  summarize: ["summarize"],
  "text-primary": ["text-dark", "text-primary"],
  "text-secondary": ["text-medium", "text-secondary"],
  "text-tertiary": ["text-light", "text-tertiary"],
  background: ["bg-white", "background"],
  "background-hover": ["bg-light"],
  "background-secondary": ["bg-medium"],
  "background-disabled": ["background-disabled"],
  shadow: ["shadow"],
  positive: ["success"],
  negative: ["danger"],
};

const originalColors = { ...colors };

/**
 * @param sdkColors color overrides from the SDK theme
 * @param appPalette color palette from the admin appearance settings
 */
export function getEmbeddingColorPalette(
  sdkColors: MetabaseColors = {},
  appPalette?: ColorPalette,
): ColorPalette {
  const mappedSdkColors = Object.fromEntries(
    Object.entries(sdkColors)
      .flatMap(([key, value]) => {
        const themeColorNames =
          SDK_TO_MAIN_APP_COLORS_MAPPING[key as MappableSdkColor];
        if (themeColorNames) {
          return themeColorNames.map(mappedColor => [mappedColor, value]);
        } else {
          return [];
        }
      })
      .filter(([mappedKey]) => mappedKey),
  );

  const chartColors =
    sdkColors.charts && getEmbeddingChartColors(sdkColors.charts);

  return {
    ...originalColors,
    ...appPalette,
    ...mappedSdkColors,
    ...chartColors,
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
