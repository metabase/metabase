import type {
  MetabaseColors,
  MetabaseTheme,
  MetabaseThemePreset,
} from "metabase/embedding-sdk/theme";
import {
  type MappableSdkColor,
  SDK_TO_MAIN_APP_COLORS_MAPPING,
} from "metabase/embedding-sdk/theme/embedding-color-palette";
import { getColors, getDarkColors } from "metabase/lib/colors/colors";
import type { ColorPalette } from "metabase/lib/colors/types";

const PRESET_SDK_COLORS: MappableSdkColor[] = [
  "background",
  "background-hover",
  "background-disabled",
  "background-secondary",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "border",
  "brand-hover",
  "brand-hover-light",
];

const COLOR_GETTERS: Record<MetabaseThemePreset, () => ColorPalette> = {
  light: getColors,
  dark: getDarkColors,
};

const getPresetColors = (preset: MetabaseThemePreset): MetabaseColors => {
  const palette = COLOR_GETTERS[preset]?.();

  if (!palette) {
    return {};
  }

  return Object.fromEntries(
    PRESET_SDK_COLORS.map((sdkColor) => {
      const mainAppColor = SDK_TO_MAIN_APP_COLORS_MAPPING[sdkColor][0];
      return [sdkColor, palette[mainAppColor]];
    }),
  );
};

export const applyThemePreset = (
  theme: MetabaseTheme | undefined,
): MetabaseTheme | undefined => {
  if (!theme?.preset) {
    return theme;
  }

  return {
    ...theme,
    colors: {
      ...getPresetColors(theme.preset),
      ...theme.colors,
    },
  };
};
