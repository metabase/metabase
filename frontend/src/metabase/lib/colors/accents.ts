import Color from "color";

import {
  ACCENT_COLOR_NAMES_MAP,
  CHART_TINT_SHADE_FACTOR,
} from "./constants/accents";
import type { ChartColorV2 } from "./types";
import type { MetabaseAccentColorKey } from "./types/color-keys";

/**
 * Transforms chartColors array into accent0 - accent7.
 * This makes defining chart colors a little bit nicer.
 *
 * Each chart color can be:
 * - A string: maps to accent{index}, and derives accent{index}-light and accent{index}-dark
 * - An object with base/tint/shade: maps to accent{index}, accent{index}-light, accent{index}-dark
 *
 * When tints or shades are not provided they will be derived from the base color.
 */
export function mapChartColorsToAccents(
  chartColors: ChartColorV2[],
): Partial<Record<MetabaseAccentColorKey, string>> {
  const mappedColors: Partial<Record<MetabaseAccentColorKey, string>> = {};

  chartColors.slice(0, 9).forEach((color, index) => {
    if (!color) {
      return;
    }

    const accentKeys = ACCENT_COLOR_NAMES_MAP[index];

    if (typeof color === "string") {
      mappedColors[accentKeys.base] = color;

      // Derive tint and shade when only base color is provided.
      // Previously, we relied on the color aliases in `lib/colors/palette.ts`,
      // but this color is defined directly in Mantine now.
      mappedColors[accentKeys.tint] = deriveChartTintColor(color);
      mappedColors[accentKeys.shade] = deriveChartShadeColor(color);

      return;
    }

    if (typeof color === "object") {
      mappedColors[accentKeys.base] = color.base;

      // Use provided tint/shade or derive from base
      mappedColors[accentKeys.tint] =
        color.tint ?? deriveChartTintColor(color.base);
      mappedColors[accentKeys.shade] =
        color.shade ?? deriveChartShadeColor(color.base);
    }
  });

  return mappedColors;
}

/**
 * Derives a tint (lighter) variant of a color.
 * Matches the alias logic in palette.ts tint().
 */
export function deriveChartTintColor(hexColor: string): string {
  const value = Color(hexColor);

  return value
    .lightness(value.lightness() + CHART_TINT_SHADE_FACTOR * 100)
    .hex();
}

/**
 * Derives a shade (darker) variant of a color.
 * Matches the alias logic in palette.ts shade().
 */
export function deriveChartShadeColor(hexColor: string): string {
  const value = Color(hexColor);

  return value
    .lightness(value.lightness() - CHART_TINT_SHADE_FACTOR * 100)
    .hex();
}
