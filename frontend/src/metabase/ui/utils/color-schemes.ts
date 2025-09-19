/* eslint-disable no-color-literals */
import type { MantineColorScheme, MantineTheme } from "@mantine/core";

type ColorShades = MantineTheme["colors"]["dark"];

export const SEMANTIC_COLOR_SCHEMES = {
  // Backgrounds
  "bg-primary": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "bg-secondary": {
    light: "#F9FBFC",
    dark: "#25262B",
  },
  "bg-tertiary": {
    light: "#EDF2F5",
    dark: "#2C2E33",
  },
  "bg-hover": {
    light: "#F9FBFC",
    dark: "#373A40",
  },

  // Text colors
  "text-primary": {
    light: "#4C5773",
    dark: "#C1C2C5",
  },
  "text-secondary": {
    light: "#696E7B",
    dark: "#A6A7AB",
  },
  "text-tertiary": {
    light: "#949AAB",
    dark: "#909296",
  },
  "text-inverse": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },

  // Borders
  "border-primary": {
    light: "#EEECEC",
    dark: "#373A40",
  },
  "border-secondary": {
    light: "#DCDFE0",
    dark: "#2C2E33",
  },

  // Brand colors (usually stay the same)
  brand: {
    light: "#509EE3",
    dark: "#509EE3",
  },
  "brand-light": {
    light: "#EEF6FD",
    dark: "#1A3A52",
  },
  "brand-lighter": {
    light: "#F8FBFE",
    dark: "#0F2A3C",
  },

  // Status colors
  success: {
    light: "#84BB4C",
    dark: "#51CF66",
  },
  error: {
    light: "hsla(358, 71%, 62%, 1)",
    dark: "#FF6B6B",
  },
  warning: {
    light: "#F9CF48",
    dark: "#FFD43B",
  },
  danger: {
    light: "hsla(358, 71%, 62%, 1)",
    dark: "#FF6B6B",
  },

  // Functional colors
  summarize: {
    light: "#88BF4D",
    dark: "#69DB7C",
  },
  filter: {
    light: "#7172AD",
    dark: "#9775FA",
  },
  focus: {
    light: "#CBE2F7",
    dark: "#1A3A52",
  },
  shadow: {
    light: "rgba(0, 0, 0, 0.08)",
    dark: "rgba(0, 0, 0, 0.25)",
  },

  // Legacy compatibility colors
  "bg-black": {
    light: "#2E353B",
    dark: "#1A1B1E",
  },
  "bg-dark": {
    light: "#93A1AB",
    dark: "#373A40",
  },
  "bg-medium": {
    light: "#EDF2F5",
    dark: "#2C2E33",
  },
  "bg-light": {
    light: "#F9FBFC",
    dark: "#25262B",
  },
  "bg-white": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "text-dark": {
    light: "#4C5773",
    dark: "#C1C2C5",
  },
  "text-medium": {
    light: "#696E7B",
    dark: "#A6A7AB",
  },
  "text-light": {
    light: "#949AAB",
    dark: "#909296",
  },
  "text-white": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "text-secondary-inverse": {
    light: "#B7BCBF",
    dark: "#6C6E73",
  },
  border: {
    light: "#EEECEC",
    dark: "#373A40",
  },
  white: {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  background: {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "background-hover": {
    light: "#F9FBFC",
    dark: "#373A40",
  },
  "background-disabled": {
    light: "#F3F5F7",
    dark: "#2C2E33",
  },
  "background-light": {
    light: "#FAFAFB",
    dark: "#25262B",
  },
  "accent-gray": {
    light: "#F3F3F4",
    dark: "#373A40",
  },
  "accent-gray-light": {
    light: "#FAFAFB",
    dark: "#2C2E33",
  },
} as const;

export type SemanticColorName = keyof typeof SEMANTIC_COLOR_SCHEMES;

export function getColorShades(colorName: string): ColorShades {
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

export function getThemeAwareColors(
  colorScheme: MantineColorScheme,
): Record<string, ColorShades> {
  const semanticColors = Object.fromEntries(
    Object.entries(SEMANTIC_COLOR_SCHEMES).map(([name, colors]) => [
      name,
      getColorShades((colors as any)[colorScheme] || colors.light),
    ]),
  );

  // Keep original Mantine colors as transparent (they handle dark mode internally)
  const originalColors = [
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
  ].reduce(
    (acc, name) => {
      acc[name] = getColorShades("transparent");
      return acc;
    },
    {} as Record<string, ColorShades>,
  );

  return {
    ...originalColors,
    ...semanticColors,
  };
}

/**
 * Get a color value for the current color scheme
 */
export function getSemanticColor(
  colorName: SemanticColorName,
  colorScheme: MantineColorScheme,
): string {
  const colors = SEMANTIC_COLOR_SCHEMES[colorName];
  return (colors as any)[colorScheme] || colors.light;
}

/**
 * CSS color variable from Metabase's theme
 */
export function color(colorName: SemanticColorName): string {
  return `var(--mb-color-${colorName})`;
}
