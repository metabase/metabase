import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { applyColorOperation } from "metabase/embedding-sdk/theme/dynamic-css-vars";
import { DYNAMIC_SDK_DEFAULT_COLORS_CONFIG } from "metabase/embedding-sdk/theme/dynamic-sdk-color-defaults";
import type { MappableSdkColor } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { SourceColorKey } from "metabase/embedding-sdk/types/private/css-variables";
import { colors, isDark } from "metabase/lib/colors";
import type { ColorName, ColorPalette } from "metabase/lib/colors/types";
import type { MantineThemeOverride } from "metabase/ui";

import { colorTuple } from "./color-tuple";

/**
 * Generate derived colors for SDK colors that the user did not define.
 * Important: the `override` must be pre-populated with mapped colors.
 *
 * Returns a Mantine theme override with the derived colors already in colorTuple format.
 */
export function getDerivedColors({
  sdkColors,
  override,
  appColors,
}: {
  sdkColors: MetabaseColors;
  override: MantineThemeOverride;
  appColors?: ColorPalette;
}): MantineThemeOverride {
  // Resolve colors that are used as the base for deriving colors.
  // Example: we might derive `background-hover` from `bg-white`
  const getColor = (colorName: SourceColorKey): string => {
    // If the color has been defined in the Mantine theme override, use it.
    if (override.colors?.[colorName]) {
      const tuple = override.colors[colorName];

      if (Array.isArray(tuple) && tuple.length > 0) {
        return tuple[0];
      }
    }

    const appColor = appColors?.[colorName as ColorName];

    // If the instance has white-labeled colors, use them.
    if (appColor) {
      return appColor;
    }

    // As a last resort, fallback to the default Metabase color object.
    return colors[colorName as ColorName];
  };

  const backgroundColor = getColor("background") ?? getColor("bg-white");
  const isDarkTheme = backgroundColor && isDark(backgroundColor);

  const derivedOverride: MantineThemeOverride = {
    ...override,
    colors: { ...override.colors },
  };

  if (!derivedOverride.colors) {
    derivedOverride.colors = {};
  }

  // Apply theme-aware derived colors for SDK colors not defined by the user.
  for (const [_colorKey, config] of Object.entries(
    DYNAMIC_SDK_DEFAULT_COLORS_CONFIG,
  )) {
    const sdkColorKey = _colorKey as MappableSdkColor;

    // Do not derive colors if the user has already defined them.
    if (sdkColors[sdkColorKey]) {
      continue;
    }

    const operation = isDarkTheme ? config.dark : config.light;
    if (!operation) {
      continue;
    }

    // One SDK color can map to multiple Mantine colors.
    // For example, `text-primary` overrides both `text-dark` and `text-primary`.
    const mantineColorKeys = SDK_TO_MAIN_APP_COLORS_MAPPING[sdkColorKey] ?? [];

    for (const mantineColorKey of mantineColorKeys) {
      if (derivedOverride.colors[mantineColorKey]) {
        continue;
      }

      const baseColor = getColor(operation.source);
      const derivedColor = applyColorOperation(baseColor, operation);

      derivedOverride.colors[mantineColorKey] = colorTuple(derivedColor);
    }
  }

  return derivedOverride;
}
