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
  const newColors = getSeriesColors(keys.length);
  const newMapping = { ...existingMapping };
  const unusedColors = new Set(newColors);

  keys.forEach(key => {
    const color = getPreferredColor(key);

    if (color && !newMapping[key] && unusedColors.has(color)) {
      newMapping[key] = color;
      unusedColors.delete(color);
    }
  });

  keys.forEach(key => {
    if (!unusedColors.size) {
      newColors.forEach(color => unusedColors.add(color));
    }

    const [color] = unusedColors;

    if (!newMapping[key]) {
      newMapping[key] = color;
      unusedColors.delete(color);
    }
  });

  return newMapping;
};
