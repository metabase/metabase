// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import { alpha, darken, isDark, isLight, lighten } from "metabase/lib/colors";
import type { MantineTheme, MantineThemeOverride } from "metabase/ui";

import type { ColorOperation } from "../types/private/css-variables";

import { DYNAMIC_CSS_VARIABLES } from "./dynamic-css-vars-config";

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

  if (operation.lighten) {
    mappedColor = lighten(mappedColor, operation.lighten);
  }

  if (operation.darken) {
    mappedColor = darken(mappedColor, operation.darken);
  }

  if (operation.alpha) {
    mappedColor = alpha(mappedColor, operation.alpha);
  }

  return mappedColor;
}

/**
 * Determine if the current color scheme is dark based on the palette.
 */
export function getIsDarkThemeFromPalette(theme: MantineThemeOverride) {
  const backgroundColor = theme.fn?.themeColor?.("background");
  const foregroundColor = theme.fn?.themeColor?.("text-dark");

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
      if (!operation) {
        return [cssVar, null];
      }

      const baseColor = theme.fn.themeColor(operation.source);
      const mappedColor = applyColorOperation(baseColor, operation);

      return [cssVar, mappedColor];
    })
    .map(([cssVar, value]) => (value ? `${cssVar}: ${value};` : ""));

  return css(mappings);
}
