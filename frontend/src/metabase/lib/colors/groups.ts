import { times, unzip } from "lodash";
import { ACCENT_COUNT, color } from "./palette";
import { AccentColorOptions, ColorPalette } from "./types";

export const getAccentColors = ({
  main = true,
  light = true,
  dark = true,
  harmony = false,
  palette,
}: AccentColorOptions = {}) => {
  const ranges = [];
  main && ranges.push(getMainAccentColors(palette));
  light && ranges.push(getLightAccentColors(palette));
  dark && ranges.push(getDarkAccentColors(palette));

  return harmony ? unzip(ranges).flat() : ranges.flat();
};

export const getMainAccentColors = (palette?: ColorPalette) => {
  return times(ACCENT_COUNT, i => color(`accent${i}`, palette));
};

export const getLightAccentColors = (palette?: ColorPalette) => {
  return times(ACCENT_COUNT, i => color(`accent${i}-light`, palette));
};

export const getDarkAccentColors = (palette?: ColorPalette) => {
  return times(ACCENT_COUNT, i => color(`accent${i}-dark`, palette));
};

export const getStatusColorRanges = () => {
  return [
    [color("error"), color("white"), color("success")],
    [color("error"), color("warning"), color("success")],
  ];
};

export const getPreferredColor = (key: string) => {
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
      return color("success");
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
      return color("error");
    case "warn":
    case "warning":
    case "incomplete":
    case "unstable":
      return color("warning");
    case "count":
      return color("brand");
    case "sum":
      return color("accent1");
    case "average":
      return color("accent2");
  }
};
