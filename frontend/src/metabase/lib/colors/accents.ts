import type { ChartColorV2 } from "./types";
import type { MetabaseAccentColorKey } from "./types/color-keys";

/**
 * Transforms chartColors array into accent0 - accent7.
 * This makes defining chart colors a little bit nicer.
 *
 * Each chart color can be:
 * - A string: maps to accent{index}
 * - An object with base/tint/shade: maps to accent{index}, accent{index}-light, accent{index}-dark
 *
 * When tints or shades are not provided they will be derived.
 */
export function mapChartColorsToAccents(
  chartColors: ChartColorV2[],
): Partial<Record<MetabaseAccentColorKey, string>> {
  const mappedColors: Partial<Record<MetabaseAccentColorKey, string>> = {};

  chartColors.slice(0, 8).forEach((color, index) => {
    if (!color) {
      return;
    }

    const accentKey = `accent${index}` as MetabaseAccentColorKey;

    if (typeof color === "string") {
      mappedColors[accentKey] = color;
      return;
    }

    if (typeof color === "object") {
      mappedColors[accentKey] = color.base;

      if (color.shade) {
        mappedColors[`accent${index}-dark` as MetabaseAccentColorKey] =
          color.shade;
      }

      if (color.tint) {
        mappedColors[`accent${index}-light` as MetabaseAccentColorKey] =
          color.tint;
      }
    }
  });

  return mappedColors;
}
