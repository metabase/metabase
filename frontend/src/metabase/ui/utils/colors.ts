import type { MantineColorsTuple } from "@mantine/core";

import { METABASE_LIGHT_THEME } from "metabase/lib/colors";
import { getThemeFromColorScheme } from "metabase/lib/colors/theme";
import type { ColorName } from "metabase/lib/colors/types";

export const ALL_COLOR_NAMES = Object.keys(
  METABASE_LIGHT_THEME.colors,
) as string[];

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

export function getThemeColors(
  colorScheme: "light" | "dark",
): Record<string, MantineColorsTuple> {
  const { colors } = getThemeFromColorScheme(colorScheme);

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
  return !!name && ALL_COLOR_NAMES.includes(name);
};

/**
 * Prefer to use `color()` instead.
 * Only use `maybeColor()` if you can't be sure you're going to have a `ColorName` as input,
 * e.g. the value comes from an endpoint, upstream type-checking is too loose, etc.
 */
export const maybeColor = (maybeColorName: ColorName | string): string => {
  return isColorName(maybeColorName) ? color(maybeColorName) : maybeColorName;
};
