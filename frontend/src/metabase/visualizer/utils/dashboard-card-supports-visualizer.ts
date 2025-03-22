import visualizations from "metabase/visualizations";
import type { DashboardCard } from "metabase-types/api";

import { isVisualizerDashboardCard } from "./is-visualizer-dashboard-card";

export function dashboardCardSupportsVisualizer(dashcard: DashboardCard) {
  if (isVisualizerDashboardCard(dashcard)) {
    return visualizations.get(
      (dashcard!.visualization_settings!.visualization as any).display,
    )?.supportsVisualizer;
  }

  const display = dashcard.card.display;
  if (display) {
    return visualizations.get(display)!.supportsVisualizer;
  }

  return false;
}
