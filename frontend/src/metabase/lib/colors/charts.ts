import d3 from "d3";
import Color from "color";
import { getAccentColors, getPreferredColor } from "./groups";

export const getColorScale = (
  extent: [number, number],
  colors: string[],
  isQuantile: boolean = false,
) => {
  if (isQuantile) {
    return d3.scale
      .quantile<string>()
      .domain(extent)
      .range(colors);
  } else {
    const [start, end] = extent;
    return d3.scale
      .linear<string>()
      .domain(
        colors.length === 3
          ? [start, start + (end - start) / 2, end]
          : [start, end],
      )
      .range(colors);
  }
};

export const getSafeColor = (color: string) => {
  return Color(color).string(0);
};

export const getColorsForValues = (
  keys: string[],
  existingMapping: Record<string, string> | null | undefined,
) => {
  const allColors = getAccentColors();
  const unusedColors = new Set(allColors);
  const resultMapping: Record<string, string> = {};

  keys.forEach(key => {
    const existingColor = existingMapping?.[key];
    const preferredColor = getPreferredColor(key);
    const [unusedColor] = unusedColors;
    const resultColor = existingColor ?? preferredColor ?? unusedColor;

    resultMapping[key] = resultColor;
    unusedColors.delete(resultColor);

    if (!unusedColors.size) {
      allColors.forEach(unusedColors.add);
    }
  });

  return resultMapping;
};
