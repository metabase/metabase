import type {
  MetabaseColors,
  MetabaseTheme,
} from "embedding-sdk-bundle/types/ui";
import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import { applyColorOperation } from "metabase/embedding-sdk/theme/dynamic-css-vars";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { colors, isDark } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";

import { EMBED_FLOW_DERIVED_COLORS_CONFIG } from "./dynamic-sdk-color-defaults";

/**
 * These text colors should always be present, as they cannot be derived.
 *
 * If it is unset, we fallback to the Metabase color.
 **/
const PRIMARY_COLORS = [
  "background",
  "text-primary",
  "brand",
] as const satisfies MetabaseColor[];

/**
 * Generate derived colors for SDK colors that the user did not define in the embed flow.
 * This is a breaking-change-free implementation that works with MetabaseTheme format
 * instead of MantineThemeOverride.
 *
 * @param theme The current MetabaseTheme with user-defined colors
 * @param appColors Optional application colors from instance settings
 * @returns A new MetabaseTheme with derived colors added
 */
export function getDerivedDefaultColorsForEmbedFlow({
  isSimpleEmbedFeatureAvailable,
  theme,
  applicationColors = {},
}: {
  isSimpleEmbedFeatureAvailable: boolean;
  theme: MetabaseTheme;
  applicationColors?: ColorPalette;
}): MetabaseTheme {
  if (!isSimpleEmbedFeatureAvailable) {
    return {
      preset: theme.preset,
    };
  }

  const userColors = theme.colors ?? {};

  const backgroundColor = getSdkColorByName(
    "background",
    userColors,
    applicationColors,
  );
  const isDarkTheme = backgroundColor && isDark(backgroundColor);

  const derivedColors: MetabaseColors = { ...userColors };

  // Ensure the primary colors are defined, as they cannot be derived.
  for (const colorKey of PRIMARY_COLORS) {
    derivedColors[colorKey] =
      getSdkColorByName(colorKey, userColors, applicationColors) ?? undefined;
  }

  // Apply theme-aware derived colors for SDK colors not defined by the user
  for (const [_colorKey, config] of Object.entries(
    EMBED_FLOW_DERIVED_COLORS_CONFIG,
  )) {
    const colorKey = _colorKey as MetabaseColor;

    // Do not derive colors if the user has already defined them
    if (userColors[colorKey]) {
      continue;
    }

    const operation = isDarkTheme ? config.dark : config.light;
    if (!operation) {
      continue;
    }

    // Derive chart color is not supported, as `charts` contain 8 chart colors.
    if (colorKey === "charts") {
      continue;
    }

    const sourceColor = getSdkColorByName(
      operation.source,
      userColors,
      applicationColors,
    );

    if (sourceColor === null) {
      continue;
    }

    const derivedColor = applyColorOperation(sourceColor, operation);

    derivedColors[colorKey] = derivedColor;
  }

  return {
    ...theme,
    colors: derivedColors,
  };
}

const getSdkColorByName = (
  colorName: MetabaseColor,
  userColors: MetabaseColors,
  appColors: ColorPalette,
): string | null => {
  // Chart colors consists of 8 colors, so they can't be derived.
  if (colorName === "charts") {
    throw new Error("chart color must not be used as a source color");
  }

  // If the SDK user has defined the color, use them.
  const userColor = userColors[colorName];
  if (userColor) {
    return userColor;
  }

  const appColorNames = SDK_TO_MAIN_APP_COLORS_MAPPING[colorName];

  // If the instance has white-labeled colors, use them
  for (const appColorName of appColorNames) {
    const appColor = appColors[appColorName as ColorName];

    if (appColor) {
      return appColor;
    }
  }

  // Fallback to the default Metabase color object.
  for (const appColorName of appColorNames) {
    const defaultColor = colors[appColorName as ColorName];

    if (defaultColor) {
      return defaultColor;
    }
  }

  return null;
};
