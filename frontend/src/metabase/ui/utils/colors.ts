import type { MantineTheme } from "@mantine/core";

import { color as legacyColor } from "metabase/lib/colors";
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
const CUSTOM_COLORS = [
  "bg-black",
  "bg-dark",
  "bg-light",
  "bg-medium",
  "bg-white",
  "border",
  "brand",
  "brand-light",
  "brand-lighter",
  "danger",
  "error",
  "filter",
  "focus",
  "shadow",
  "success",
  "summarize",
  "text-dark",
  "text-light",
  "text-medium",
  "text-white",
  "warning",
  "white",
  // TODO: Check with an adult and make sure this is okay
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "background",
  "background-disabled",
  "accent-gray",
  "accent-gray-light",
] as const;

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

export function getThemeColors(): Record<string, ColorShades> {
  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map(name => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(
      CUSTOM_COLORS.map(name => [name, getColorShades(legacyColor(name))]),
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
