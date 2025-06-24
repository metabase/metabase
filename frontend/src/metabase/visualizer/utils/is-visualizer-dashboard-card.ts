import type {
  BaseDashboardCard,
  VisualizerDashboardCard,
} from "metabase-types/api";

export function isVisualizerDashboardCard(
  dashcard?: BaseDashboardCard,
): dashcard is VisualizerDashboardCard {
  if (!dashcard?.visualization_settings) {
    return false;
  }

  return dashcard.visualization_settings["visualization"] !== undefined;
}
