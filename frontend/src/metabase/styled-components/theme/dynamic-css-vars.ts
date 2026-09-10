// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
import Color from "color";

import type { MantineTheme, MantineThemeOverride } from "metabase/ui";
import { isDark, isLight } from "metabase/ui";

import type { ColorOperation } from "./dynamic-css-vars-config";
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
export function getIsDarkThemeFromPalette(
  theme: Pick<MantineThemeOverride, "fn">,
) {
  const backgroundColor = theme.fn?.themeColor?.("background_page-primary");
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
export function getDynamicCssVariables(theme: Pick<MantineTheme, "fn">) {
  const isDarkTheme = getIsDarkThemeFromPalette(theme);

  const mappings = Object.entries(DYNAMIC_CSS_VARIABLES)
    .map(([cssVar, config]) => {
      const operation = isDarkTheme ? config.dark : config.light;
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
