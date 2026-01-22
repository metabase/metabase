import type {
  MetabaseColor,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
import { colors } from "metabase/lib/colors";
import { mapChartColorsToAccents } from "metabase/lib/colors/accents";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

/**
 * Define SDK colors that can be mapped 1:1 to the main app colors.
 *
 * Every color defined in `lib/colors` can be mapped here. However,
 * we do define a custom public interface for some colors,
 * such as chart colors, which needs to be excluded here.
 */
export type MappableSdkColor = Exclude<MetabaseColor, "charts">;

/**
 * Mapping of SDK colors to main app colors.
 *
 * The main app colors are defined in `metabase/lib/colors/colors.ts`.
 * One SDK theme color can map to multiple main app colors.
 */
export const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<
  MappableSdkColor,
  ColorName[]
> = {
  brand: ["brand"],
  "brand-hover": ["brand-light"],
  "brand-hover-light": ["brand-lighter"],
  border: ["border"],
  filter: ["filter"],
  summarize: ["summarize"],
  "text-primary": ["text-primary"],
  "text-secondary": ["text-secondary"],
  "text-tertiary": ["text-tertiary"],
  background: ["background-primary"],
  "background-secondary": ["background-secondary", "background-tertiary"],
  "background-hover": ["background-secondary"],
  "background-disabled": ["background-disabled"],
  "background-light": ["background-secondary"],
  shadow: ["shadow"],
  positive: ["success"],
  negative: ["danger"],
  "text-white": ["text-primary-inverse", "white"],
  error: ["error"],
  "background-error": ["background-error"],
  "text-hover": ["text-hover"],
  focus: ["focus"],
};

/**
 * If the user forgot to define a theme color,
 * we apply the fallback color instead if it is also defined.
 */
export const SDK_MISSING_COLORS_FALLBACK: Partial<
  Record<MappableSdkColor, MappableSdkColor>
> = {
  "background-secondary": "background",
};

/**
 * These colors must never be changed.
 * For example, the blue Metabase brand color.
 **/
export const SDK_UNCHANGEABLE_COLORS: ColorName[] = ["metabase-brand"];

export const SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING: Record<
  keyof NonNullable<MetabaseComponentTheme["tooltip"]>,
  ColorName
> = {
  textColor: "tooltip-text",
  secondaryTextColor: "tooltip-text-secondary",
  backgroundColor: "tooltip-background",
  focusedBackgroundColor: "tooltip-background-focused",
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
          return themeColorNames.map((mappedColor) => [mappedColor, value]);
        } else {
          return [];
        }
      })
      .filter(([mappedKey]) => mappedKey),
  );

  const chartColors =
    sdkColors.charts && mapChartColorsToAccents(sdkColors.charts);

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

  /**
   * (EMB-696)
   * Reset colors set previously that's now not passed in `sdkColors`.
   * Otherwise, previously modified colors will persist, and won't be reset to default values.
   */
  Object.keys(colors).forEach((key) => {
    if (!combinedThemeColors[key as ColorName]) {
      delete colors[key as ColorName];
    }
  });
}
