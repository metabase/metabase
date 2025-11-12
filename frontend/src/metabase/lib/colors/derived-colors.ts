/* eslint-disable no-color-literals */

import { getLightColorPalette } from "./colors";
import type { ColorPalette, MetabaseColorsV2 } from "./types";

const defaultLightTheme = getLightColorPalette();

/**
 * Generates a complete palette from three main colors.
 * It takes the three main colors (brand, background-primary, text-primary)
 * and generates all supporting colors based on them.
 *
 * If a color already exists in the source object, it will be used instead of the default.
 *
 * @param colors - source color object containing the customizable colors
 * @returns complete color palette with all color keys populated
 */
export function deriveColorPalette(
  colors: Partial<MetabaseColorsV2> = {},
): ColorPalette {
  return {
    // Main colors
    brand: colors.brand ?? defaultLightTheme.brand,
    "background-primary":
      colors["background-primary"] ?? defaultLightTheme["background-primary"],
    "text-primary": colors["text-primary"] ?? defaultLightTheme["text-primary"],

    // Supporting colors
    // TODO(EMB-984, EMB-1013, EMB-1016): derive these colors via lightness stops and color harmonies
    "text-secondary": "rgba(45, 51, 63, 0.6)",
    "text-tertiary": "rgba(45, 51, 63, 0.4)",
    "text-primary-inverse": "rgba(255, 255, 255, 0.8)",
    "background-secondary": "rgba(240, 240, 248, 1)",
    shadow: "rgba(45, 51, 63, 0.2)",
    border: "rgba(216, 216, 228, 1)",
    filter: "#7172AD",
    summarize: "#88BF4D",
    positive: "#88BF4D",
    negative: "#EF8C8C",

    ...colors,
  };
}

/** Default chart colors for Metabase */
export const DEFAULT_CHART_COLORS = [
  "#509EE3", // blue
  "#88BF4D", // green
  "#A989C5", // purple
  "#EF8C8C", // red
  "#F9D45C", // yellow
  "#F2A86F", // orange
  "#98D9D9", // teal
  "#7172AD", // indigo
] as const;
