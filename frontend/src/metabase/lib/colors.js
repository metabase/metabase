// @flow

import d3 from "d3";
import Color from "color";
import { Harmonizer } from "color-harmony";

import { deterministicAssign } from "./deterministic";

type ColorName = string;
type ColorString = string;
type ColorFamily = { [name: ColorName]: ColorString };

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
/* eslint-disable no-color-literals */
const colors = {
  brand: "#509EE3",
  accent1: "#9CC177",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
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
/* eslint-enable no-color-literals */
export default colors;

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
  normal.gray = colors["text-medium"];
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

export const alpha = (color: ColorString, alpha: number): ColorString =>
  Color(color)
    .alpha(alpha)
    .string();

export const darken = (color: ColorString, factor: number): ColorString =>
  Color(color)
    .darken(factor)
    .string();

const PREFERRED_COLORS = {
  [colors["success"]]: [
    "success",
    "succeeded",
    "pass",
    "valid",
    "complete",
    "completed",
    "accepted",
    "active",
    "profit",
  ],
  [colors["error"]]: [
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
  [colors["warning"]]: ["warn", "warning", "incomplete"],
  [colors["brand"]]: ["count"],
  [colors["accent1"]]: ["sum"],
  [colors["accent2"]]: ["average"],
};

const PREFERRED_COLORS_MAP = new Map();
for (const [color, keys] of Object.entries(PREFERRED_COLORS)) {
  // $FlowFixMe
  for (const key of keys) {
    PREFERRED_COLORS_MAP.set(key, color);
  }
}

type Key = string;

function getPreferredColor(key: Key) {
  return PREFERRED_COLORS_MAP.get(key.toLowerCase());
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
