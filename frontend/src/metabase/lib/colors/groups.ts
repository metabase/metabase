import Color from "color";
import _ from "underscore";

import { ACCENT_COUNT, color } from "./palette";
import type { AccentColorOptions, ColorName, ColorPalette } from "./types";

export const getAccentColors = (
  {
    main = true,
    light = true,
    dark = true,
    harmony = false,
    gray = true,
  }: AccentColorOptions = {},
  palette?: ColorPalette,
): string[] => {
  const ranges: string[][] = [];
  if (main) {
    ranges.push(getMainAccentColors(palette, gray));
  }
  if (light) {
    ranges.push(getLightAccentColors(palette, gray));
  }
  if (dark) {
    ranges.push(getDarkAccentColors(palette, gray));
  }

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

const getBaseAccentsNames = (withGray = false) => {
  const accents: ColorName[] = _.times(
    ACCENT_COUNT,
    (i) => `accent${i}` as ColorName,
  );
  if (withGray) {
    accents.push("accent-gray");
  }

  return accents;
};

export const getMainAccentColors = (
  palette?: ColorPalette,
  withGray = false,
): string[] => {
  // Ensure that colors are defined in hex, not HSLA
  return getBaseAccentsNames(withGray).map((accent) =>
    Color(color(accent, palette)).hex(),
  );
};

export const getLightAccentColors = (
  palette?: ColorPalette,
  withGray = false,
): string[] => {
  return getBaseAccentsNames(withGray).map((accent) =>
    Color(color(`${accent}-light` as ColorName, palette)).hex(),
  );
};

export const getDarkAccentColors = (
  palette?: ColorPalette,
  withGray = false,
) => {
  return getBaseAccentsNames(withGray).map((accent) =>
    Color(color(`${accent}-dark` as ColorName, palette)).hex(),
  );
};

export const getStatusColorRanges = (): string[][] => {
  return [
    [color("error"), "transparent", color("success")],
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
