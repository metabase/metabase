import type {
  MetabaseColor,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
import { colors } from "metabase/ui/colors";
import { mapChartColorsToAccents } from "metabase/ui/colors/accents";
import { mapWhitelabelColorsToTokens } from "metabase/ui/colors/constants/whitelabel-colors";
import type { ColorName, ColorPalette } from "metabase/ui/colors/types";
import type { ColorSettings } from "metabase-types/api";

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
 * The main app colors are defined in `metabase/ui/colors/colors.ts`.
 * One SDK theme color can map to multiple main app colors.
 */
export const SDK_TO_MAIN_APP_COLORS_MAPPING: Record<
  MappableSdkColor,
  ColorName[]
> = {
  brand: ["core-brand"],
  "brand-hover": ["background_surface-hover", "button-default-neutral-hover"],
  "brand-hover-light": ["background_surface-hover"],
  border: ["border-neutral"],
  filter: ["core-filter"],
  summarize: ["core-summarize"],
  "text-primary": [
    "text-primary",
    "button_label-default-neutral-default",
    "button_label-light-neutral-default",
    "button_label-subtle-neutral-default",
    "icon-primary",
  ],
  "text-secondary": ["text-secondary"],
  "text-tertiary": ["text-disabled"],
  background: [
    "background_page-primary",
    "background_surface-primary",
    "button-default-neutral-default",
  ],
  "background-secondary": [
    "background_page-secondary",
    "background_page-tertiary",
  ],
  "background-hover": [],
  "background-disabled": ["background_surface-disabled"],
  "background-light": ["background_page-secondary"],
  shadow: ["shadow-default"],
  positive: ["feedback-positive", "feedback-positive-strong"],
  negative: ["feedback-negative", "feedback-negative-strong"],
  "text-white": ["text-primary-inverse", "core-white"],
  error: ["feedback-negative"],
  "background-error": ["background_surface-error"],
  "text-hover": ["text-brand-hover"],
  focus: ["input-focus"],
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
export const SDK_UNCHANGEABLE_COLORS: ColorName[] = ["core-metabase_brand"];

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
 * @param appColors the `application-colors` setting
 */
export function getEmbeddingColorPalette(
  sdkColors: MetabaseColors = {},
  appColors?: ColorSettings,
): ColorPalette {
  const mappedSdkColors = Object.fromEntries(
    Object.entries(sdkColors)
      .flatMap(([key, value]) => {
        const themeColorNames =
          // Unjustified type cast. FIXME
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

  const merged: ColorPalette = {
    ...originalColors,
    ...mapWhitelabelColorsToTokens(appColors),
    ...mappedSdkColors,
    ...chartColors,
  };

  return merged;
}

/**
 * !! Mutate the global colors object to apply the new colors.
 *
 * @param sdkColors color overrides from the SDK theme
 * @param appColors the `application-colors` setting
 */
export function setGlobalEmbeddingColors(
  sdkColors?: MetabaseColors,
  appColors?: ColorSettings,
) {
  const combinedThemeColors = getEmbeddingColorPalette(sdkColors, appColors);

  Object.entries(combinedThemeColors).forEach(([key, value]) => {
    // Unjustified type cast. FIXME
    colors[key as ColorName] = value;
  });

  /**
   * (EMB-696)
   * Reset colors set previously that's now not passed in `sdkColors`.
   * Otherwise, previously modified colors will persist, and won't be reset to default values.
   */
  Object.keys(colors).forEach((key) => {
    // Unjustified type cast. FIXME
    if (!combinedThemeColors[key as ColorName]) {
      // Unjustified type cast. FIXME
      delete colors[key as ColorName];
    }
  });
}
