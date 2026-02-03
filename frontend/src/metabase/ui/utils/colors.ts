import type { MantineColorsTuple } from "@mantine/core";

import type { ResolvedColorScheme } from "metabase/lib/color-scheme";
import { ALL_COLOR_NAMES, deriveFullMetabaseTheme } from "metabase/lib/colors";
import type { ColorName, MetabaseColorKey } from "metabase/lib/colors/types";
import type { ColorSettings } from "metabase-types/api";

const ORIGINAL_COLORS = [
  "dark",
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "teal",
] as const;

export function getColorShades(colorName: string): MantineColorsTuple {
  // yes this is silly, but it makes typescript so happy
  return [
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
  ];
}

export function getMantineThemeColors(
  colorScheme: ResolvedColorScheme,
  whitelabelColors?: ColorSettings | null,
): Record<string, MantineColorsTuple> {
  const { colors } = deriveFullMetabaseTheme({ colorScheme, whitelabelColors });

  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map((name) => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(
      Object.entries(colors).map(([name, value]) => [
        name,
        getColorShades(value),
      ]),
    ),
  };
}

/**
 * css color variable from Metabase's theme
 * @param colorName
 * @returns string referencing a css variable
 */
export function color(colorName: ColorName): string {
  return `var(--mb-color-${colorName})`;
}

export const isColorName = (name?: string | null): name is ColorName => {
  return !!name && ALL_COLOR_NAMES.includes(name as MetabaseColorKey);
};

/**
 * Prefer to use `color()` instead.
 * Only use `maybeColor()` if you can't be sure you're going to have a `ColorName` as input,
 * e.g. the value comes from an endpoint, upstream type-checking is too loose, etc.
 */
export const maybeColor = (maybeColorName: ColorName | string): string => {
  return isColorName(maybeColorName) ? color(maybeColorName) : maybeColorName;
};

const CSS_VAR_REGEX = /^var\(--mb-color-(.+)\)$/;

/**
 * Resolves CSS variable color values (created by `color()`) to their actual values.
 * This is the inverse of `color()` - use it when you need actual color values
 * instead of CSS variable references (e.g., in static viz contexts like email/Slack
 * exports where CSS variables cannot be resolved by the browser).
 */
export function resolveColorFromCssVariable(
  colorValue: string,
  getColor: (colorName: string) => string,
): string {
  const match = colorValue.match(CSS_VAR_REGEX);
  if (match) {
    const colorName = match[1];
    return getColor(colorName);
  }
  return colorValue;
}
