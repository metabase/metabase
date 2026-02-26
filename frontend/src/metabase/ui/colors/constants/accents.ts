import type { ChartColorV2 } from "../types";

/**
 * Maps chart color indices to their accent color keys.
 * Each entry contains the base, tint (light), and shade (dark) variants.
 *
 * This makes it easier to find-and-replace in the future.
 */
export const ACCENT_COLOR_NAMES_MAP = [
  { base: "accent0", tint: "accent0-light", shade: "accent0-dark" },
  { base: "accent1", tint: "accent1-light", shade: "accent1-dark" },
  { base: "accent2", tint: "accent2-light", shade: "accent2-dark" },
  { base: "accent3", tint: "accent3-light", shade: "accent3-dark" },
  { base: "accent4", tint: "accent4-light", shade: "accent4-dark" },
  { base: "accent5", tint: "accent5-light", shade: "accent5-dark" },
  { base: "accent6", tint: "accent6-light", shade: "accent6-dark" },
  { base: "accent7", tint: "accent7-light", shade: "accent7-dark" },
  { base: "accent-gray", tint: "accent-gray-light", shade: "accent-gray-dark" },
] as const satisfies ChartColorV2[];

export const ALL_ACCENT_COLOR_NAMES = ACCENT_COLOR_NAMES_MAP.flatMap(
  ({ base, tint, shade }) => [base, tint, shade],
);

/**
 * How much to tint and shade the light and dark chart color variants for.
 * Matches the default factor of tint() and shade() used for legacy colors.
 */
export const CHART_TINT_SHADE_FACTOR = 0.125;
