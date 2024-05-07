import type { CardDisplayType } from "metabase-types/api";

/**
 * Default height for each visualization type.
 *
 * The values are derived from the visualization's default size in the dashboard.
 */
export function getDefaultVizHeight(
  type?: CardDisplayType,
): number | undefined {
  // If the card type is not loaded yet, return a default height.
  if (!type) {
    return 50;
  }

  if (["scalar", "smartscalar"].includes(type)) {
    return 50;
  }

  if (["table", "pivot"].includes(type)) {
    return 400;
  }

  return 250;
}
