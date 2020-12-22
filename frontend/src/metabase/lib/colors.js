// @flow

import d3 from "d3";
import Color from "color";
import { Harmonizer } from "color-harmony";

import { deterministicAssign } from "./deterministic";

export type ColorName = string;
export type ColorString = string;
export type ColorFamily = { [name: ColorName]: ColorString };

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
/* eslint-disable no-color-literals */
const colors = {
  brand: "#509EE3",
  "brand-light": "#DDECFA",
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
  shadow: "rgba(0,0,0,0.08)",
  border: "#F0F0F0",
  /* Saturated colors for the SQL editor. Shouldn't be used elsewhere since they're not white-labelable. */
  "saturated-blue": "#2D86D4",
  "saturated-green": "#70A63A",
  "saturated-purple": "#885AB1",
  "saturated-red": "#ED6E6E",
  "saturated-yellow": "#F9CF48",
};
/* eslint-enable no-color-literals */
export default colors;

export const aliases = {
  summarize: "accent1",
  filter: "accent7",
  database: "accent2",
  dashboard: "brand",
  pulse: "accent4",
  nav: "brand",
};

export const harmony = [];

// DEPRECATED: we should remove these and use `colors` directly
// compute satured/desaturated variants using "color" lib if absolutely required
export const normal = {};
export const saturated = {};
export const desaturated = {};

// make sure to do the initial "sync"
syncColors();

export function syncColors() {
  syncHarmony();
  syncDeprecatedColorFamilies();
}

export const HARMONY_GROUP_SIZE = 8; // match initialColors length below

function syncHarmony() {
  const harmonizer = new Harmonizer();
  const initialColors = [
    colors["brand"],
    colors["accent1"],
    colors["accent2"],
    colors["accent3"],
    colors["accent4"],
    colors["accent5"],
    colors["accent6"],
    colors["accent7"],
  ];
  harmony.splice(0, harmony.length);
  // round 0 includes brand and all accents
  harmony.push(...initialColors);
  // rounds 1-4 generated harmony
  // only harmonize brand and accents 1 through 4
  const initialColorHarmonies = initialColors
    .slice(0, 5)
    .map(color => harmonizer.harmonize(color, "fiveToneD"));
  for (let roundIndex = 1; roundIndex < 5; roundIndex++) {
    for (
      let colorIndex = 0;
      colorIndex < initialColorHarmonies.length;
      colorIndex++
    ) {
      harmony.push(initialColorHarmonies[colorIndex][roundIndex]);
    }
  }
}

// syncs deprecated color families for legacy code
function syncDeprecatedColorFamilies() {
  // normal + saturated + desaturated
  normal.blue = saturated.blue = desaturated.blue = colors["brand"];
  normal.green = saturated.green = desaturated.green = colors["accent1"];
  normal.purple = saturated.purple = desaturated.purple = colors["accent2"];
  normal.red = saturated.red = desaturated.red = colors["accent3"];
  normal.yellow = saturated.yellow = desaturated.yellow = colors["accent4"];
  normal.orange = colors["accent5"];
  normal.teal = colors["accent6"];
  normal.indigo = colors["accent7"];
  normal.gray = colors["text-dark"];
  normal.grey1 = colors["text-light"];
  normal.grey2 = colors["text-medium"];
  normal.grey3 = colors["text-dark"];
  normal.text = colors["text-dark"];
}

export const getRandomColor = (family: ColorFamily): ColorString => {
  // $FlowFixMe: Object.values doesn't preserve the type :-/
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
      .quantile()
      .domain(extent)
      .range(colors);
  } else {
    const [start, end] = extent;
    return d3.scale
      .linear()
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

export function color(color: ColorString | ColorName): ColorString {
  if (color in colors) {
    return colors[color];
  }
  if (color in aliases) {
    return colors[aliases[color]];
  }
  // TODO: validate this is a ColorString
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

const PREFERRED_COLORS = {
  [colors["success"]]: [
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
  [colors["error"]]: [
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
  [colors["warning"]]: ["warn", "warning", "incomplete", "unstable"],
  [colors["brand"]]: ["count"],
  [colors["accent1"]]: ["sum"],
  [colors["accent2"]]: ["average"],
};

const PREFERRED_COLORS_MAP = {};
for (const color in PREFERRED_COLORS) {
  if (Object.prototype.hasOwnProperty.call(PREFERRED_COLORS, color)) {
    const keys = PREFERRED_COLORS[color];
    for (let i = 0; i < keys.length; i++) {
      PREFERRED_COLORS_MAP[keys[i]] = color;
    }
  }
}

type Key = string;

function getPreferredColor(key: Key) {
  return PREFERRED_COLORS_MAP[key.toLowerCase()];
}

// returns a mapping of deterministically assigned colors to keys, optionally with a fixed value mapping
export function getColorsForValues(
  keys: string[],
  existingAssignments: ?{ [key: Key]: ColorString } = {},
) {
  const all = Object.values(harmony);
  const primaryTier = all.slice(0, 8);
  const secondaryTier = all.slice(8);
  return deterministicAssign(
    keys,
    primaryTier,
    existingAssignments,
    getPreferredColor,
    [secondaryTier],
  );
}

// conviennce for a single color (only use for visualizations with a single color)
export function getColorForValue(key: Key) {
  return getColorsForValues([key])[key];
}
