import type { DashboardCard } from "metabase-types/api";

export function isVisualizerDashboardCard(
  card: DashboardCard | undefined,
): boolean {
  if (!card?.visualization_settings) {
    return false;
  }

  return card.visualization_settings["visualization"] !== undefined;
}
