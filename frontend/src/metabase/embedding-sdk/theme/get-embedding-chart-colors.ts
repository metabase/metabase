import type { ChartColor } from "metabase/embedding-sdk/theme";

/**
 * Map the input chart colors from the theme settings to the
 * color names we use in our charts.
 *
 * @param chartColors chart colors defined in embedding theme settings
 */
export function getEmbeddingChartColors(
  chartColors: ChartColor[],
): Record<string, string> {
  const mappedColors: Record<string, string> = {};

  // Populate the 8 chart colors, including the shades and tints when available.
  // When shades or tints are not explicitly defined, they're derived by `libs/colors/palette`.
  chartColors.slice(0, 8).forEach((color, index) => {
    if (!color) {
      return;
    }

    if (typeof color === "string") {
      mappedColors[`accent${index}`] = color;
      return;
    }

    if (typeof color === "object") {
      mappedColors[`accent${index}`] = color.base;

      if (color.shade) {
        mappedColors[`accent${index}-dark`] = color.shade;
      }

      if (color.tint) {
        mappedColors[`accent${index}-light`] = color.tint;
      }
    }
  });

  return mappedColors;
}
