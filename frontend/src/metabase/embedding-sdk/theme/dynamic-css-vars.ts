// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
import Color from "color";

import { isDark, isLight } from "metabase/lib/colors";
import type { MantineTheme, MantineThemeOverride } from "metabase/ui";

import type { ColorOperation } from "../types/private/css-variables";

import { DYNAMIC_CSS_VARIABLES } from "./dynamic-css-vars-config";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "./embedding-color-palette";

const isColorDefined = (color?: string): color is string =>
  !!color && color !== "transparent" && color !== "unset";

/**
 * Applies color operations (lighten, darken, alpha) to a base color.
 */
export function applyColorOperation(
  baseColor: string,
  operation: ColorOperation,
): string {
  let mappedColor = baseColor;

  if (operation.lighten !== undefined) {
    mappedColor = Color(mappedColor).lighten(operation.lighten).rgb().string();
  }

  if (operation.darken !== undefined) {
    mappedColor = Color(mappedColor).darken(operation.darken).rgb().string();
  }

  if (operation.alpha !== undefined) {
    mappedColor = Color(mappedColor).alpha(operation.alpha).rgb().string();
  }

  return mappedColor;
}

/**
 * Determine if the current color scheme is dark based on the palette.
 */
export function getIsDarkThemeFromPalette(theme: MantineThemeOverride) {
  const backgroundColor = theme.fn?.themeColor?.("background-primary");
  const foregroundColor = theme.fn?.themeColor?.("text-primary");

  // Dark background color indicates a dark theme.
  if (isColorDefined(backgroundColor)) {
    return isDark(backgroundColor);
  }

  // Light foreground color indicates a dark theme.
  if (isColorDefined(foregroundColor)) {
    return isLight(foregroundColor);
  }

  return false;
}

/**
 * Dynamically-generated CSS variables based on the theme.
 * These colors are derived from the palette, with a configured tint and shade percentage.
 */
export function getDynamicCssVariables(theme: MantineTheme) {
  const isDarkTheme = getIsDarkThemeFromPalette(theme);

  const mappings = Object.entries(DYNAMIC_CSS_VARIABLES)
    .map(([cssVar, config]) => {
      let operation: ColorOperation | null = null;

      if (isDarkTheme && config.dark) {
        operation = config.dark;
      } else if (!isDarkTheme && config.light) {
        operation = config.light;
      }

      // Do not define the CSS variable if the source color or operation is not defined.
      // In addition, do not use chart color as source color to sample from.
      if (!operation || operation?.source === "charts") {
        return [cssVar, null];
      }

      // One SDK color will be mapped to multiple main app colors.
      // All of those colors will have the same value, so we sample from the first one.
      const colorKeys = SDK_TO_MAIN_APP_COLORS_MAPPING[operation.source];

      if (!colorKeys) {
        return [cssVar, null];
      }

      const baseColor = theme.fn.themeColor(colorKeys?.[0]);
      const mappedColor = applyColorOperation(baseColor, operation);

      return [cssVar, mappedColor];
    })
    .map(([cssVar, value]) => (value ? `${cssVar}: ${value};` : ""));

  return css(mappings);
}
