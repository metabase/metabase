import Color from "color";
import { t } from "ttag";
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
    // NOTE - the correct column name is "avg", but this used "average" historically
    // fixing this would change colors in charts
    case "average":
      return color("accent2", palette);
  }
};

// Maps aggregation display names to legacy column names (e.g. "Sum of Price" → "sum",
// "Count" → "count"). This is needed to get the same preferred color and the same
// color hash as before aggregation columns switched to generic names.
export function getPreferredColorKey(name: string): string | undefined {
  const mapping: [string, string][] = [
    [t`Count`, "count"],
    [t`Cumulative count`, "count"],
    [t`Average`, "avg"],
    [t`Cumulative sum`, "sum"],
    [t`Distinct values`, "count"],
    [t`Max`, "max"],
    [t`Median`, "median"],
    [t`Min`, "min"],
    [t`Standard deviation`, "stddev"],
    [t`Sum`, "sum"],
    [t`Variance`, "var"],
  ];

  for (const [prefix, key] of mapping) {
    if (name.startsWith(prefix)) {
      return key;
    }
  }
  return undefined;
}

// Deduplicates color keys to match legacy column names (e.g. "count", "count_2", "sum")
// so that series colors don't regress when multiple aggregations of the same type are used.
export function getDeduplicatedColorKeys(
  colorKeys: (string | undefined)[],
): (string | undefined)[] {
  const counts = new Map<string, number>();
  return colorKeys.map((key) => {
    if (key == null) {
      return undefined;
    }
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return count === 0 ? key : `${key}_${count + 1}`;
  });
}
