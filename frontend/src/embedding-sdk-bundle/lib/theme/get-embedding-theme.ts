import { merge } from "icepick";
import _ from "underscore";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import type {
  MetabaseColor,
  MetabaseComponentTheme,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  DEFAULT_SDK_FONT_SIZE,
  getEmbeddingComponentOverrides,
} from "metabase/embedding-sdk/theme";
import type { MappableSdkColor } from "metabase/embedding-sdk/theme/embedding-color-palette";
import {
  SDK_MISSING_COLORS_FALLBACK,
  SDK_TO_MAIN_APP_COLORS_MAPPING,
  SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING,
} from "metabase/embedding-sdk/theme/embedding-color-palette";
import type {
  MetabaseAccentColorKey,
  MetabaseColorKey,
} from "metabase/lib/colors";
import { mapChartColorsToAccents } from "metabase/lib/colors/accents";
import type { MantineThemeOverride } from "metabase/ui";
import type { ColorSettings } from "metabase-types/api";

import { colorTuple } from "./color-tuple";

const SDK_BASE_FONT_SIZE = `${DEFAULT_SDK_FONT_SIZE}px`;

// Strip any key that has the value of "undefined"
const stripUndefinedKeys = <T>(x: T): unknown =>
  _.isObject(x)
    ? _.pick(_.mapObject(x, stripUndefinedKeys), (v) => !_.isUndefined(v))
    : x;

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
  font: string | undefined,
  whitelabeledColors?: ColorSettings | undefined,
): MantineThemeOverride {
  const components: MetabaseComponentTheme = merge(
    DEFAULT_EMBEDDED_COMPONENT_THEME,
    stripUndefinedKeys(theme.components),
  );

  const override: MantineThemeOverride = {
    // font is coming from either redux, where we store theme.fontFamily,
    // or from the instance settings, we're adding a default to be used while loading the settings
    fontFamily: font ?? DEFAULT_FONT,

    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),

    other: {
      ...components,
      fontSize: theme.fontSize ?? SDK_BASE_FONT_SIZE,
    },

    components: getEmbeddingComponentOverrides(),
    colors: {},
  };

  // Apply whitelabeled colors from appearance settings
  for (const key in whitelabeledColors) {
    if (!override.colors) {
      override.colors = {};
    }

    override.colors[key as MetabaseColorKey] = colorTuple(
      whitelabeledColors[key],
    );
  }

  if (theme.colors) {
    if (!override.colors) {
      override.colors = {};
    }

    const userColors = { ...theme.colors };

    // Apply fallback colors for missing colors that the user forgot to define.
    // For example, if they forgot to define `background-secondary` but have
    // defined `background`, we use it as a fallback.
    for (const key in SDK_MISSING_COLORS_FALLBACK) {
      const targetColor = key as MappableSdkColor;
      const fallbackColor = SDK_MISSING_COLORS_FALLBACK[targetColor];

      if (
        fallbackColor &&
        userColors[fallbackColor] &&
        !userColors[targetColor]
      ) {
        userColors[targetColor] = userColors[fallbackColor];
      }
    }

    // Apply color palette overrides
    for (const name in userColors) {
      const color = userColors[name as MetabaseColor];

      if (color && typeof color === "string") {
        const themeColorNames =
          SDK_TO_MAIN_APP_COLORS_MAPPING[name as MappableSdkColor];

        // If the sdk color does not exist in the mapping, skip it.
        if (!themeColorNames) {
          console.warn(
            `Color ${name} does not exist in the Embedding SDK. Please remove it from the theme configuration.`,
          );

          continue;
        }

        for (const themeColorName of themeColorNames) {
          override.colors[themeColorName] = colorTuple(color);
        }
      }
    }

    if (theme.colors.charts) {
      const accents = mapChartColorsToAccents(theme.colors.charts);

      for (const _accentKey in accents) {
        const accentKey = _accentKey as MetabaseAccentColorKey;
        const accentColor = accents[accentKey];

        if (!accentColor) {
          continue;
        }

        override.colors[accentKey] = colorTuple(accentColor);
      }
    }
  }

  if (theme.components?.tooltip) {
    if (!override.colors) {
      override.colors = {};
    }

    for (const _tooltipKey in SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING) {
      type TooltipKey = keyof NonNullable<MetabaseComponentTheme["tooltip"]>;
      const tooltipKey = _tooltipKey as TooltipKey;
      const colorKey = SDK_TO_MAIN_APP_TOOLTIP_COLORS_MAPPING[tooltipKey];
      const tooltipColor = theme.components.tooltip[tooltipKey];

      if (tooltipColor && colorKey) {
        override.colors[colorKey] = colorTuple(tooltipColor);
      }
    }
  }

  return override;
}
