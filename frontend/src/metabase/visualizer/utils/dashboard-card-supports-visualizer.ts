import visualizations from "metabase/visualizations";
import type { DashboardCard } from "metabase-types/api";

import { isVisualizerDashboardCard } from "./is-visualizer-dashboard-card";

export function dashboardCardSupportsVisualizer(dashcard: DashboardCard) {
  if (!isVisualizerDashboardCard(dashcard)) {
    return false;
  }

  return visualizations.get(
    (dashcard!.visualization_settings!.visualization as any).display,
  )?.supportsVisualizer;
}
