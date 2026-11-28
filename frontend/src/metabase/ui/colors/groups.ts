import { ACCENT_COLOR_NAMES_MAP } from "./constants/accents";
import { parseColor, toHex } from "./css-color";
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
  const variants: ("base" | "tint" | "shade")[] = [];
  if (main) {
    variants.push("base");
  }
  if (light) {
    variants.push("tint");
  }
  if (dark) {
    variants.push("shade");
  }

  const accents = gray
    ? ACCENT_COLOR_NAMES_MAP
    : ACCENT_COLOR_NAMES_MAP.slice(0, ACCENT_COUNT);
  const names = harmony
    ? accents.flatMap((accent) => variants.map((variant) => accent[variant]))
    : variants.flatMap((variant) => accents.map((accent) => accent[variant]));

  return names.map((name) => ({
    name,
    value: toHex(parseColor(color(name, palette))),
  }));
};

export const getAccentColors = (
  options: AccentColorOptions = {},
  palette?: ColorPalette,
): string[] => getNamedAccentColors(options, palette).map(({ value }) => value);

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
