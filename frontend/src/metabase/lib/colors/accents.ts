import type { ChartColorV2 } from "./types";
import type { MetabaseColorKey } from "./types/color-keys";

/**
 * Transforms chartColors array into accent0 - accent7.
 * This makes defining chart colors a little bit nicer.
 *
 * Each chart color can be:
 * - A string: maps to accent{index}
 * - An object with base/tint/shade: maps to accent{index}, accent{index}-light, accent{index}-dark
 *
 * When tints or shades are not provided, they're derived by the palette system.
 */
export function mapChartColorsToAccents(
  chartColors: ChartColorV2[],
): Partial<Record<MetabaseColorKey, string>> {
  const mappedColors: Partial<Record<MetabaseColorKey, string>> = {};

  chartColors.slice(0, 8).forEach((color, index) => {
    if (!color) {
      return;
    }

    const accentKey = `accent${index}` as MetabaseColorKey;

    if (typeof color === "string") {
      mappedColors[accentKey] = color;
      return;
    }

    if (typeof color === "object") {
      mappedColors[accentKey] = color.base;

      if (color.shade) {
        mappedColors[`accent${index}-dark` as MetabaseColorKey] = color.shade;
      }

      if (color.tint) {
        mappedColors[`accent${index}-light` as MetabaseColorKey] = color.tint;
      }
    }
  });

  return mappedColors;
}
