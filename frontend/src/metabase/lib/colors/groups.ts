import _ from "underscore";

import { ACCENT_COUNT, color } from "./palette";
import type { AccentColorOptions, ColorPalette } from "./types";

export const getAccentColors = (
  {
    main = true,
    light = true,
    dark = true,
    harmony = false,
    grey = true,
  }: AccentColorOptions = {},
  palette?: ColorPalette,
) => {
  const ranges = [];
  main && ranges.push(getMainAccentColors(palette, grey));
  light && ranges.push(getLightAccentColors(palette, grey));
  dark && ranges.push(getDarkAccentColors(palette, grey));

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

const getBaseAccentsNames = (withGrey = false) => {
  const accents = _.times(ACCENT_COUNT, i => `accent${i}`);
  if (withGrey) {
    accents.push("accent-grey");
  }

  return accents;
};

export const getMainAccentColors = (
  palette?: ColorPalette,
  withGrey = false,
) => {
  return getBaseAccentsNames(withGrey).map(accent => color(accent, palette));
};

export const getLightAccentColors = (
  palette?: ColorPalette,
  withGrey = false,
) => {
  return getBaseAccentsNames(withGrey).map(accent =>
    color(`${accent}-light`, palette),
  );
};

export const getDarkAccentColors = (
  palette?: ColorPalette,
  withGrey = false,
) => {
  return getBaseAccentsNames(withGrey).map(accent =>
    color(`${accent}-dark`, palette),
  );
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
