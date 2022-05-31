import d3 from "d3";
import Color from "color";
import { times } from "lodash";
import { getAccentColors, getHarmonyColors } from "metabase/lib/colors/groups";

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
/* eslint-disable no-color-literals */
const colors: Record<string, string> = {
  brand: "#509EE3",
  "brand-light": "#DDECFA",
  accent0: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
  accent6: "#98D9D9",
  accent7: "#7172AD",
  "admin-navbar": "#7172AD",
  white: "#FFFFFF",
  black: "#2E353B",
  success: "#84BB4C",
  danger: "#ED6E6E",
  error: "#ED6E6E",
  warning: "#F9CF48",
  "text-dark": "#4C5773",
  "text-medium": "#949AAB",
  "text-light": "#B8BBC3",
  "text-white": "#FFFFFF",
  "bg-black": "#2E353B",
  "bg-dark": "#93A1AB",
  "bg-medium": "#EDF2F5",
  "bg-light": "#F9FBFC",
  "bg-white": "#FFFFFF",
  "bg-yellow": "#FFFCF2",
  focus: "#CBE2F7",
  shadow: "rgba(0,0,0,0.08)",
  border: "#EEECEC",

  /* Saturated colors for the SQL editor. Shouldn't be used elsewhere since they're not white-labelable. */
  "saturated-blue": "#2D86D4",
  "saturated-green": "#70A63A",
  "saturated-purple": "#885AB1",
  "saturated-red": "#ED6E6E",
  "saturated-yellow": "#F9CF48",
};
/* eslint-enable no-color-literals */

export type ColorFamily = typeof colors;
export type ColorName = string;
export type ColorString = string;

export default colors;
export const aliases: Record<string, (family: ColorFamily) => string> = {
  dashboard: family => color("brand", family),
  nav: family => color("bg-white", family),
  content: family => color("bg-light", family),
  summarize: family => color("accent1", family),
  database: family => color("accent2", family),
  pulse: family => color("accent4", family),
  filter: family => color("accent7", family),

  "brand-light": family => lighten(color("brand", family), 0.532),
  focus: family => lighten(color("brand", family), 0.7),

  ...Object.fromEntries(
    times(8, i => [
      `accent${i}-light`,
      family => lighten(color(`accent${i}`, family), 0.3),
    ]),
  ),

  ...Object.fromEntries(
    times(8, i => [
      `accent${i}-dark`,
      family => darken(color(`accent${i}`, family), 0.3),
    ]),
  ),
};

export const getRandomColor = (family: ColorFamily): ColorString => {
  const colors: ColorString[] = Object.values(family);
  return colors[Math.floor(Math.random() * colors.length)];
};
type ColorScale = (input: number) => ColorString;
export const getColorScale = (
  extent: [number, number],
  colors: string[],
  quantile: boolean = false,
): ColorScale => {
  if (quantile) {
    return d3.scale
      .quantile<any>()
      .domain(extent)
      .range(colors);
  } else {
    const [start, end] = extent;
    return d3.scale
      .linear<any>()
      .domain(
        colors.length === 3
          ? [start, start + (end - start) / 2, end]
          : [start, end],
      )
      .range(colors);
  }
};
// HACK: d3 may return rgb values with decimals but certain rendering engines
// don't support that (e.x. Safari and CSSBox)
export function roundColor(color: ColorString): ColorString {
  return color.replace(
    /rgba\((\d+(?:\.\d+)),\s*(\d+(?:\.\d+)),\s*(\d+(?:\.\d+)),\s*(\d+\.\d+)\)/,
    (_, r, g, b, a) =>
      `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`,
  );
}

export function color(color: ColorString | ColorName, family = colors) {
  if (color in family) {
    return family[color as ColorName];
  }

  if (color in aliases) {
    return aliases[color](family);
  }

  return color;
}

export function alpha(c: ColorString | ColorName, a: number): ColorString {
  return Color(color(c))
    .alpha(a)
    .string();
}
export function darken(
  c: ColorString | ColorName,
  f: number = 0.25,
): ColorString {
  return Color(color(c))
    .darken(f)
    .string();
}
export function lighten(
  c: ColorString | ColorName,
  f: number = 0.5,
): ColorString {
  return Color(color(c))
    .lighten(f)
    .string();
}

export type ColorMapping = (color: string) => string;

export const getColorMappings = (
  colorName: ColorName,
): Record<ColorName, ColorMapping> => {
  return { [colorName]: color => color };
};

const PREFERRED_COLORS: Record<string, string[]> = {
  success: [
    "success",
    "succeeded",
    "pass",
    "passed",
    "valid",
    "complete",
    "completed",
    "accepted",
    "active",
    "profit",
  ],
  error: [
    "error",
    "fail",
    "failed",
    "failure",
    "failures",
    "invalid",
    "rejected",
    "inactive",
    "loss",
    "cost",
    "deleted",
    "pending",
  ],
  warning: ["warn", "warning", "incomplete", "unstable"],
  brand: ["count"],
  accent1: ["sum"],
  accent2: ["average"],
};
const PREFERRED_COLORS_MAP: Record<string, string> = {};

for (const color in PREFERRED_COLORS) {
  if (Object.prototype.hasOwnProperty.call(PREFERRED_COLORS, color)) {
    const keys = PREFERRED_COLORS[color];

    for (let i = 0; i < keys.length; i++) {
      PREFERRED_COLORS_MAP[keys[i]] = color;
    }
  }
}

function getPreferredColor(key: string) {
  return color(PREFERRED_COLORS_MAP[key.toLowerCase()]);
}

export function getColorsForValues(
  keys: string[],
  existingColors: Record<string, string> | null | undefined = {},
) {
  const colors = keys.length <= 8 ? getAccentColors() : getHarmonyColors();

  const entries = keys.map((key, index) => {
    const existingColor = existingColors?.[key];
    const preferredColor = getPreferredColor(key);
    const paletteColor = colors[index % colors.length];

    return [key, existingColor ?? preferredColor ?? paletteColor];
  });

  return Object.fromEntries(entries);
}
// conviennce for a single color (only use for visualizations with a single color)
export function getColorForValue(key: string) {
  return getColorsForValues([key])[key];
}
