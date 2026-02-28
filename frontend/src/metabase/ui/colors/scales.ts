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

// Matches RGBA color strings with integers, decimals, and scientific notation
// Handles: rgba(136, 191, 77, 0.75), rgba(136.7, 191.3, 77.2, 0.75), rgba(136, 191, 77, 7.5e-7)
const NUMBER_PATTERN = String.raw`-?\d+(?:\.\d+)?(?:e[+-]?\d+)?`;

const RGBA_REGEX = new RegExp(
  `rgba\\(` +
    `\\s*(?<r>${NUMBER_PATTERN})\\s*,` +
    `\\s*(?<g>${NUMBER_PATTERN})\\s*,` +
    `\\s*(?<b>${NUMBER_PATTERN})\\s*,` +
    `\\s*(?<a>${NUMBER_PATTERN})\\s*` +
    `\\)`,
  "i",
);
/**
 * Normalizes RGBA color strings by rounding RGB components to integers
 * and clamping alpha values to [0, 1]
 *
 * After color library supports fully scientific notation we might remove this function
 * https://github.com/Qix-/color-string/pull/89
 *
 * Handles edge cases including:
 * - Integer RGB values: `rgba(136, 191, 77, 0.75)`
 * - Decimal RGB values: `rgba(136.7, 191.3, 77.2, 0.75)`
 * - Scientific notation: `rgba(136, 191, 77, 7.5e-7)`
 * - Out-of-range alpha values (clamped to [0, 1])
 *
 * @param color - A color string that may contain RGBA values with various numeric formats
 * @returns A normalized color string with integer RGB values and clamped alpha channel
 *
 * @example
 * ```ts
 * getSafeColor("rgba(123.456, 78.9, 255.1, 0.5)")
 * // Returns: "rgba(123, 79, 255, 0.5)"
 *
 * getSafeColor("rgba(136, 191, 77, 7.5e-7)")
 * // Returns: "rgba(136, 191, 77, 0.000001)"
 *
 * getSafeColor("rgba(100, 200, 50, 1.5)")
 * // Returns: "rgba(100, 200, 50, 1)"
 * ```
 */
export const getSafeColor = (color: string): string => {
  return color.replace(RGBA_REGEX, (...args) => {
    const groups = args.at(-1);
    const rNum = parseFloat(groups.r);
    const gNum = parseFloat(groups.g);
    const bNum = parseFloat(groups.b);
    const aNum = parseFloat(groups.a);

    // Round RGB to integers, clamp alpha to [0, 1], round to 6 decimals
    const clampedAlpha = Math.min(
      1,
      Math.max(0, Math.round(aNum * 1000000) / 1000000),
    );

    return `rgba(${Math.round(rNum)}, ${Math.round(gNum)}, ${Math.round(bNum)}, ${clampedAlpha})`;
  });
};
