import { css } from "@emotion/react";

import { darken, isDark, isLight, lighten } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import type { MantineTheme } from "metabase/ui";

import type { SemanticColorKey } from "./embedding-color-palette";

type SourceColorKey = ColorName | SemanticColorKey;

type DynamicCssVarColorDefinition = {
  source: SourceColorKey;

  /** Darkens the color in light mode */
  darkenBy: number;

  /** Lightens the color in dark mode */
  lightenBy: number;
};

/**
 * These CSS variables are dynamically generated based on the theme.
 */
export const THEME_DEPENDENT_CSS_VARS = {
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
} satisfies Record<string, DynamicCssVarColorDefinition>;

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
    .map(([cssVar, { source: sourceColorKey, lightenBy, darkenBy }]) => {
      const sourceColor = theme.fn.themeColor(sourceColorKey);

      const finalColor = isDarkTheme
        ? lighten(sourceColor, lightenBy)
        : darken(sourceColor, darkenBy);

      return [cssVar, finalColor];
    })
    .map(([cssVar, value]) => (value ? `${cssVar}: ${value};` : ""));

  return css(mappings);
}
