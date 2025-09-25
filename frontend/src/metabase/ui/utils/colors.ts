import type { MantineTheme } from "@mantine/core";

import { colorConfig } from "metabase/lib/colors";
type ColorShades = MantineTheme["colors"]["dark"];

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

// these should only include semantic colors
// for use in the UI
const CUSTOM_COLORS = Object.keys(colorConfig);

export function getColorShades(colorName: string): ColorShades {
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
): Record<string, ColorShades> {
  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map((name) => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(
      Object.entries(colorConfig).map(([name, colors]) => [
        name,
        getColorShades(colors[colorScheme] || colors.light),
      ]),
    ),
  };
}

/**
 * css color variable from Metabase's theme
 * @param colorName
 * @returns string referencing a css variable
 */
export function color(colorName: (typeof CUSTOM_COLORS)[number]): string {
  return `var(--mb-color-${colorName})`;
}
