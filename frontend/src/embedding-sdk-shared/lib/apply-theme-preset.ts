import type {
  MetabaseColors,
  MetabaseTheme,
  MetabaseThemePreset,
} from "metabase/embedding-sdk/theme";
import {
  type MappableSdkColor,
  SDK_TO_MAIN_APP_COLORS_MAPPING,
} from "metabase/embedding-sdk/theme/embedding-color-palette";
import { deriveFullMetabaseTheme } from "metabase/lib/colors";

const PRESET_SDK_COLORS: MappableSdkColor[] = [
  "background",
  "background-disabled",
  "background-secondary",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "border",
  "brand-hover",
  "brand-hover-light",
];

const getPresetColors = (preset: MetabaseThemePreset): MetabaseColors => {
  if (preset !== "light" && preset !== "dark") {
    return {};
  }

  const { colors } = deriveFullMetabaseTheme({ colorScheme: preset });

  return Object.fromEntries(
    PRESET_SDK_COLORS.map((sdkColor) => {
      const mainAppColor = SDK_TO_MAIN_APP_COLORS_MAPPING[sdkColor][0];
      return [sdkColor, colors[mainAppColor]];
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
