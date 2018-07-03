// @flow

import d3 from "d3";
import Color from "color";

type ColorName = string;
type ColorString = string;
type ColorFamily = { [name: ColorName]: ColorString };

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
const colors = {
  brand: "#509EE3",
  accent1: "#9CC177",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F1B556",
  accent6: "#A6E7F3",
  accent7: "#7172AD",
  white: "#FFFFFF",
  black: "#2E353B",
  success: "#84BB4C",
  error: "#ED6E6E",
  warning: "#F9CF48",
  "text-dark": "#2E353B",
  "text-medium": "#74838F",
  "text-light": "#C7CFD4",
  "text-white": "#FFFFFF",
  "bg-black": "#2E353B",
  "bg-dark": "#93A1AB",
  "bg-medium": "#EDF2F5",
  "bg-light": "#F9FBFC",
  "bg-white": "#FFFFFF",
  shadow: "rgba(0,0,0,0.08)",
  border: "#D7DBDE",
};
export default colors;

export const brand = {
  normal: colors["brand"],
  saturated: colors["brand"],
  desaturated: colors["brand"],
};

export const normal = {
  blue: brand.normal,
  green: colors["accent1"],
  purple: colors["accent2"],
  red: colors["accent3"],
  yellow: colors["accent4"],
  orange: colors["warning"],
  teal: colors["text-light"],
  indigo: colors["accent2"],
  gray: colors["text-medium"],
  grey1: colors["text-light"],
  grey2: colors["text-medium"],
  grey3: colors["text-dark"],
  text: colors["text-dark"],
};

export const saturated = {
  blue: brand.saturated,
  green: colors["success"],
  purple: colors["accent2"],
  red: colors["error"],
  yellow: colors["warning"],
};

export const desaturated = {
  blue: brand.desaturated,
  green: colors["accent1"],
  purple: colors["accent2"],
  red: colors["accent3"],
  yellow: colors["accent4"],
};

export const harmony = [
  colors["brand"],
  colors["accent1"],
  colors["accent2"],
  colors["accent3"],
  colors["accent4"],
  colors["warning"],
  colors["text-light"],
  colors["accent2"],
  colors["text-medium"],
  colors["accent2"],
  colors["success"],
  colors["error"],
  colors["accent1"],
  colors["accent2"],
  colors["accent2"],
  colors["accent1"],
  colors["text-medium"],
  colors["error"],
  colors["text-medium"],
  colors["accent4"],
  colors["accent1"],
  colors["accent2"],
  colors["accent1"],
  colors["accent2"],
  colors["success"],
  colors["brand"],
  colors["accent2"],
  colors["accent4"],
  colors["error"],
];

export const getRandomColor = (family: ColorFamily): ColorString => {
  // $FlowFixMe: Object.values doesn't preserve the type :-/
  const colors: ColorString[] = Object.values(family);
  return colors[Math.floor(Math.random() * colors.length)];
};

type ColorScale = (input: number) => ColorString;

export const getColorScale = (
  extent: [number, number],
  colors: string[],
): ColorScale => {
  const [start, end] = extent;
  return d3.scale
    .linear()
    .domain(
      colors.length === 3
        ? [start, start + (end - start) / 2, end]
        : [start, end],
    )
    .range(colors);
};

export const alpha = (color: ColorString, alpha: number): ColorString =>
  Color(color)
    .alpha(alpha)
    .string();

export const darken = (color: ColorString, factor: number): ColorString =>
  Color(color)
    .darken(factor)
    .string();
