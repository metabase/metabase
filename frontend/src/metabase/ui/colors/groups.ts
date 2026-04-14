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
// The strings below must match the translations produced by
// `count-aggregation-no-arg-display-name-fns`, `count-aggregation-display-name-fns`
// and `unary-aggregation-display-name-fns` in src/metabase/lib/aggregation.cljc.
export function getPreferredColorKey(name: string): string | undefined {
  // No-argument aggregation names — matched exactly.
  const exactMapping = [
    [t`Count`, "count"],
    [t`Cumulative count`, "count"],
  ];
  // Aggregation names that include a column argument — matched as a prefix,
  // since the argument is substituted into "{0}".
  const prefixMapping = [
    [t`Average of ${""}`, "avg"],
    [t`Cumulative sum of ${""}`, "sum"],
    [t`Distinct values of ${""}`, "count"],
    [t`Max of ${""}`, "max"],
    [t`Median of ${""}`, "median"],
    [t`Min of ${""}`, "min"],
    [t`Standard deviation of ${""}`, "stddev"],
    [t`Sum of ${""}`, "sum"],
    [t`Variance of ${""}`, "var"],
    [t`Count of ${""}`, "count"],
    [t`Cumulative count of ${""}`, "count"],
  ];

  for (const [exact, key] of exactMapping) {
    if (name === exact) {
      return key;
    }
  }
  for (const [prefix, key] of prefixMapping) {
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
