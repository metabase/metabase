import _ from "underscore";

import { ACCENT_CORE_COUNT, ACCENT_TOTAL_COUNT, color } from "./palette";
import type { AccentColorOptions, ColorPalette } from "./types";

export const getAccentColors = (
  {
    main = true,
    light = true,
    dark = true,
    harmony = false,
    all = false,
  }: AccentColorOptions = {},
  palette?: ColorPalette,
) => {
  const ranges = [];
  const n = all ? ACCENT_TOTAL_COUNT : ACCENT_CORE_COUNT;

  main && ranges.push(getMainAccentColors(n, palette));
  light && ranges.push(getLightAccentColors(n, palette));
  dark && ranges.push(getDarkAccentColors(n, palette));

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

const getMainAccentColors = (n: number, palette?: ColorPalette) => {
  return _.times(n, i => color(`accent${i}`, palette));
};

const getLightAccentColors = (n: number, palette?: ColorPalette) => {
  return _.times(n, i => color(`accent${i}-light`, palette));
};

const getDarkAccentColors = (n: number, palette?: ColorPalette) => {
  return _.times(n, i => color(`accent${i}-dark`, palette));
};

export const getStatusColorRanges = () => {
  return [
    [color("error"), color("bg-white"), color("success")],
    [color("error"), color("warning"), color("success")],
  ];
};

export const getPreferredColor = (key: string, palette?: ColorPalette) => {
  switch (key.toLowerCase()) {
    case "success":
    case "succeeded":
    case "pass":
    case "passed":
    case "valid":
    case "complete":
    case "completed":
    case "accepted":
    case "active":
    case "profit":
      return color("success", palette);
    case "cancel":
    case "canceled":
    case "cancelled":
    case "error":
    case "fail":
    case "failed":
    case "failure":
    case "failures":
    case "invalid":
    case "rejected":
    case "inactive":
    case "loss":
    case "cost":
    case "deleted":
    case "pending":
      return color("error", palette);
    case "warn":
    case "warning":
    case "incomplete":
    case "unstable":
      return color("warning", palette);
    case "count":
      return color("accent0", palette);
    case "sum":
      return color("accent1", palette);
    case "average":
      return color("accent2", palette);
  }
};
