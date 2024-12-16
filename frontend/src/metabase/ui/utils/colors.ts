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
] as const;

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
