import { css } from "@emotion/react";

import { darken, isDark, isLight, lighten } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import type { MantineTheme } from "metabase/ui";

import type { SemanticColorKey } from "./embedding-color-palette";

type SourceColorKey = ColorName | SemanticColorKey;

type DynamicCssVarColorDefinition = {
  /**
   * The color to use as a source for generating the CSS variable.
   * If the value is an object, it will use the light color for light themes and the dark color for dark themes.
   **/
  source: SourceColorKey | { light: SourceColorKey; dark: SourceColorKey };

  /** For light themes, darken the color by this percentage */
  darkenBy?: number;

  /** For dark themes, lighten the color by this percentage */
  lightenBy?: number;
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
    darkenBy: 0.02,
    lightenBy: 0.5,
  },
  "--mb-color-notebook-step-bg-hover": {
    source: "bg-white",
    darkenBy: 0.06,
    lightenBy: 0.4,
  },
  "--mb-color-sdk-toolbar-button-bg-hover": {
    source: { light: "brand", dark: "bg-white" },
    lightenBy: 0.4,
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
    .map(([cssVar, { source, lightenBy, darkenBy }]) => {
      let sourceColor = "";

      if (typeof source === "string") {
        // use same source for light and dark themes
        sourceColor = theme.fn.themeColor(source);
      } else {
        // use different source colors for light and dark themes
        sourceColor = isDarkTheme
          ? theme.fn.themeColor(source.dark)
          : theme.fn.themeColor(source.light);
      }

      let mappedColor = sourceColor;

      if (isDarkTheme && lightenBy) {
        mappedColor = lighten(sourceColor, lightenBy);
      } else if (!isDarkTheme && darkenBy) {
        mappedColor = darken(sourceColor, darkenBy);
      }

      return [cssVar, mappedColor];
    })
    .map(([cssVar, value]) => (value ? `${cssVar}: ${value};` : ""));

  return css(mappings);
}
