import type { DashboardCard, QuestionDashboardCard } from "metabase-types/api";

export function isVisualizerDashboardCard(
  dashcard: DashboardCard | undefined,
): dashcard is QuestionDashboardCard {
  if (!dashcard?.visualization_settings) {
    return false;
  }

  return dashcard.visualization_settings["visualization"] !== undefined;
}
