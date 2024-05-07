import type { CardDisplayType } from "metabase-types/api";

/**
 * Visualization's default height is determined by the
 * chart's height measured when at the minimum size.
 */
export function getDefaultVizHeight(
  type?: CardDisplayType,
): number | undefined {
  if (!type) {
    return;
  }

  if (["line", "bar", "area", "combo"].includes(type)) {
    return 210;
  }

  if (["scalar", "smartscalar"].includes(type)) {
    return 100;
  }

  return 200;
}
