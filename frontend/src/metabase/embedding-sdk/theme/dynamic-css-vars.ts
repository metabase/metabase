import { css } from "@emotion/react";

import { alpha, darken, isDark, isLight, lighten } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import type { MantineTheme } from "metabase/ui";

import type { SemanticColorKey } from "./embedding-color-palette";

type SourceColorKey = ColorName | SemanticColorKey;

type ColorOperation = {
  lighten?: number;
  darken?: number;
  alpha?: number;
};

type DynamicCssVarColorDefinition = {
  /**
   * The color to use as a source for generating the CSS variable.
   * If the value is an object, it will use the light color for light themes and the dark color for dark themes.
   **/
  source: SourceColorKey | { light?: SourceColorKey; dark?: SourceColorKey };

  // applies different operations to light and dark themes
  light?: ColorOperation;
  dark?: ColorOperation;
};

/**
 * These CSS variables are dynamically generated based on the theme.
 */
export const THEME_DEPENDENT_CSS_VARS: Record<
  string,
  DynamicCssVarColorDefinition
> = {
  "--mb-color-notebook-step-bg": {
    source: "bg-white",
    light: { darken: 0.05 },
    dark: { lighten: 0.5 },
  },
  "--mb-color-notebook-step-bg-hover": {
    source: "bg-white",
    light: { darken: 0.1 },
    dark: { lighten: 0.4 },
  },
  "--mb-color-background-hover": {
    source: { dark: "bg-white" },
    dark: { lighten: 0.5 },
  },
};

const isColorDefined = (color: string) =>
  color && color !== "transparent" && color !== "unset";

/**
 * Determine if the current color scheme is dark based on the palette.
 */
export function getIsDarkThemeFromPalette(theme: MantineTheme) {
  const backgroundColor = theme.fn.themeColor("background");
  const foregroundColor = theme.fn.themeColor("text-dark");

  // Dark foreground color indicates a dark theme.
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

  const mappings = Object.entries(THEME_DEPENDENT_CSS_VARS)
    .map(([cssVar, config]) => {
      let colorKey: SourceColorKey | null = null;
      let operation: ColorOperation | null = null;

      if (typeof config.source === "string") {
        colorKey = config.source;
      } else if (isDarkTheme && config.source.dark) {
        colorKey = config.source.dark;
      } else if (!isDarkTheme && config.source.light) {
        colorKey = config.source.light;
      }

      if (isDarkTheme && config.dark) {
        operation = config.dark;
      } else if (!isDarkTheme && config.light) {
        operation = config.light;
      }

      // Do not define the CSS variable if the source color or operation is not defined.
      if (!colorKey || !operation) {
        return [cssVar, null];
      }

      let mappedColor = theme.fn.themeColor(colorKey);

      if (operation.lighten) {
        mappedColor = lighten(mappedColor, operation.lighten);
      }

      if (operation.darken) {
        mappedColor = darken(mappedColor, operation.darken);
      }

      if (operation.alpha) {
        mappedColor = alpha(mappedColor, operation.alpha);
      }

      return [cssVar, mappedColor];
    })
    .map(([cssVar, value]) => (value ? `${cssVar}: ${value};` : ""));

  return css(mappings);
}
