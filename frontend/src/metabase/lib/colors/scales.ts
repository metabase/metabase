import { scaleLinear, scaleQuantile } from "d3-scale";

export const getColorScale = (
  extent: [number, number],
  colors: string[],
  isQuantile: boolean = false,
) => {
  if (isQuantile) {
    return scaleQuantile<string>(extent, colors);
  } else {
    const [start, end] = extent;

    const domain =
      colors.length === 3
        ? [start, start + (end - start) / 2, end]
        : [start, end];

    return scaleLinear<string>(domain, colors);
  }
};

const RGBA_REGEX =
  /rgba\((\d+\.\d+),\s*(\d+\.\d+),\s*(\d+\.\d+),\s*(\d+\.\d+)\)/;

/**
 * Normalizes RGBA color strings by rounding RGB components to integers
 * while preserving the alpha channel. This ensures colors are in standard
 * CSS format where RGB values are integers (0-255) and alpha is a decimal (0-1).
 *
 * @param color - A color string that may contain RGBA values with decimal RGB components
 * @returns A normalized color string with integer RGB values and preserved alpha channel
 *
 * @example
 * ```ts
 * getSafeColor("rgba(123.456, 78.9, 255.1, 0.5)")
 * // Returns: "rgba(123,79,255,0.5)"
 *
 * getSafeColor("rgba(100.7, 200.3, 50.9, 0.75)")
 * // Returns: "rgba(101,200,51,0.75)"
 * ```
 */
export const getSafeColor = (color: string) => {
  return color.replace(RGBA_REGEX, (_, r, g, b, a) => {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
  });
};
