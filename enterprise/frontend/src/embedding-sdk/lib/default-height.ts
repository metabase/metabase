import type { CardDisplayType } from "metabase-types/api";

/**
 * Default height for each visualization type.
 *
 * The values are derived from the visualization's default size in the dashboard.
 */
export function getDefaultVizHeight(type: CardDisplayType): number {
  if (["scalar", "smartscalar"].includes(type)) {
    return 50;
  }

  if (["table", "pivot"].includes(type)) {
    return 400;
  }

  return 250;
}
