import type { MantineTheme } from "@mantine/core";

import { color } from "metabase/lib/colors";

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
];

const CUSTOM_COLORS = [
  "brand",
  "brand-lighter",
  "text-white",
  "text-light",
  "text-medium",
  "text-dark",
  "focus",
  "border",
  "bg-light",
  "bg-medium",
  "bg-dark",
  "bg-black",
  "success",
  "error",
  "white",
  "accent5",
];

function getColorShades(color: string): ColorShades {
  return Array(10).fill(color) as ColorShades;
}

export function getThemeColors(): Record<string, ColorShades> {
  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map(name => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(
      CUSTOM_COLORS.map(name => [name, getColorShades(color(name))]),
    ),
  };
}
