import Color from "color";
import _ from "underscore";

import { ACCENT_COLOR_NAMES_MAP } from "./constants/accents";
import { ACCENT_COUNT, color } from "./palette";
import type { AccentColorOptions, ColorPalette, NamedColor } from "./types";

/**
 * Accent colors paired with their palette names, so that a picked color can be
 * stored as a reference to the palette instead of a fixed value.
 */
export const getNamedAccentColors = (
  {
    main = true,
    light = true,
    dark = true,
    harmony = false,
    gray = true,
  }: AccentColorOptions = {},
  palette?: ColorPalette,
): NamedColor[] => {
  const ranges: NamedColor[][] = [];
  if (main) {
    ranges.push(getNamedAccents("base", palette, gray));
  }
  if (light) {
    ranges.push(getNamedAccents("tint", palette, gray));
  }
  if (dark) {
    ranges.push(getNamedAccents("shade", palette, gray));
  }

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

export const getAccentColors = (
  options: AccentColorOptions = {},
  palette?: ColorPalette,
): string[] => getNamedAccentColors(options, palette).map(({ value }) => value);

const getNamedAccents = (
  variant: "base" | "tint" | "shade",
  palette?: ColorPalette,
  withGray = false,
): NamedColor[] => {
  const accents = withGray
    ? ACCENT_COLOR_NAMES_MAP
    : ACCENT_COLOR_NAMES_MAP.slice(0, ACCENT_COUNT);

  return accents.map((accent) => {
    const name = accent[variant];

    // Ensure that colors are defined in hex, not HSLA
    return { name, value: Color(color(name, palette)).hex() };
  });
};

export const getMainAccentColors = (
  palette?: ColorPalette,
  withGray = false,
): string[] =>
  getAccentColors({ light: false, dark: false, gray: withGray }, palette);

export const getLightAccentColors = (
  palette?: ColorPalette,
  withGray = false,
): string[] =>
  getAccentColors({ main: false, dark: false, gray: withGray }, palette);

export const getDarkAccentColors = (
  palette?: ColorPalette,
  withGray = false,
): string[] =>
  getAccentColors({ main: false, light: false, gray: withGray }, palette);

export const getStatusColorRanges = (): string[][] => {
  return [
    [color("feedback-negative"), "transparent", color("feedback-positive")],
    [
      color("feedback-negative"),
      color("feedback-warning"),
      color("feedback-positive"),
    ],
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
      return color("feedback-positive", palette);
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
      return color("feedback-negative", palette);
    case "warn":
    case "warning":
    case "incomplete":
    case "unstable":
      return color("feedback-warning", palette);
    case "count":
      return color("accent0", palette);
    case "sum":
      return color("accent1", palette);
    case "average":
      return color("accent2", palette);
  }
};
