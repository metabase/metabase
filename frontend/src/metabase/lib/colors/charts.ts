import d3 from "d3";
import {
  getAccentColors,
  getHarmonyColors,
  getPreferredColor,
} from "metabase/lib/colors/groups";

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

export const getColorForValue = (key: string) => {
  return getColorsForValues([key])[key];
};

export const getColorsForValues = (
  keys: string[],
  existingColors: Record<string, string> | null | undefined = {},
) => {
  const colors = keys.length <= 8 ? getAccentColors() : getHarmonyColors();

  const entries = keys.map((key, index) => {
    const existingColor = existingColors?.[key];
    const preferredColor = getPreferredColor(key);
    const paletteColor = colors[index % colors.length];

    return [key, existingColor ?? preferredColor ?? paletteColor];
  });

  return Object.fromEntries(entries);
};
