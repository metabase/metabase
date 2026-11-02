import type { VisualizationDisplay } from "metabase-types/api";

// From resources/instance_analytics/collections/main/usage_analytics/dashboard_overview, in display order
export const USAGE_STATS_CARD_ENTITY_IDS = [
  "XIiIsCNMk9gg-eO2hkl8S",
  "_p6UGMWOQn5-yf03uGsaN",
  "xrgv7nzXe_v8ORWIbq839",
] as const;

// The displays of the cards above, in the same order
export const USAGE_STATS_CARD_SKELETON_DISPLAYS = [
  "line",
  "row",
  "table",
] as const satisfies readonly VisualizationDisplay[];

export const DASHBOARD_ID_PARAMETER_SLUG = "dashboard_id";

export const USAGE_STATS_CARD_HEIGHT = 400;
