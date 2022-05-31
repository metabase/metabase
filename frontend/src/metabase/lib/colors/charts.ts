import d3 from "d3";
import Color from "color";
import { getPreferredColor, getSeriesColors } from "./groups";

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
  const allColors = getSeriesColors(keys.length);
  const newMapping = { ...existingMapping };
  const unusedColors = new Set(allColors);

  keys.forEach(key => {
    const color = getPreferredColor(key);

    if (color && unusedColors.has(color)) {
      newMapping[key] = color;
      unusedColors.delete(color);
    }
  });

  const regularColors = unusedColors.size
    ? Array.from(unusedColors)
    : allColors;

  keys.forEach((key, index) => {
    const color = regularColors[index % regularColors.length];

    if (!newMapping[key]) {
      newMapping[key] = color;
    }
  });

  return newMapping;
};
