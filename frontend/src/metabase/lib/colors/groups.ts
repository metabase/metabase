import _ from "underscore";

import { ACCENT_COUNT, color } from "./palette";
import type { AccentColorOptions, ColorPalette } from "./types";

export const getAccentColors = (
  {
    main = true,
    light = true,
    dark = true,
    harmony = false,
  }: AccentColorOptions = {},
  palette?: ColorPalette,
) => {
  const ranges = [];
  main && ranges.push(getMainAccentColors(palette));
  light && ranges.push(getLightAccentColors(palette));
  dark && ranges.push(getDarkAccentColors(palette));

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

export const getMainAccentColors = (palette?: ColorPalette) => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}`, palette));
};

export const getLightAccentColors = (palette?: ColorPalette) => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}-light`, palette));
};

export const getDarkAccentColors = (palette?: ColorPalette) => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}-dark`, palette));
};

export const getStatusColorRanges = () => {
  return [
    [color("error"), color("white"), color("success")],
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
