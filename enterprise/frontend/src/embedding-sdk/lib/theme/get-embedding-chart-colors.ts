import type { ChartColor } from "embedding-sdk/types/theme";

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

  // Populate accent0 - accent7 colors, including the dark and light variations.
  chartColors.slice(0, 8).forEach((color, index) => {
    // TODO: auto-generate when the color is not provided
    if (!color) {
      return;
    }

    if (typeof color === "string") {
      mappedColors[`accent${index}`] = color;

      // TODO: auto-generate the -dark and -light colors when they are not provided
      mappedColors[`accent${index}-dark`] = color;
      mappedColors[`accent${index}-light`] = color;

      return;
    }

    if (typeof color === "object") {
      mappedColors[`accent${index}`] = color.base;

      // TODO: auto-generate when the darker colors are not provided
      if (color.darker) {
        mappedColors[`accent${index}-dark`] = color.darker;
      }

      // TODO: auto-generate the lighter colors are not provided
      if (color.lighter) {
        mappedColors[`accent${index}-light`] = color.lighter;
      }
    }
  });

  return mappedColors;
}
