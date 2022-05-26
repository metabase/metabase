import d3 from "d3";
import Color from "color";

export const getColorScale = (
  extent: [number, number],
  colors: string[],
  quantile: boolean = false,
) => {
  if (quantile) {
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

export const roundColor = (color: string) => {
  return Color(color).string(0);
};
