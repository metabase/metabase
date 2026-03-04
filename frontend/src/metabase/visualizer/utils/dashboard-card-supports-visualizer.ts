import visualizations from "metabase/visualizations";
import type { DashboardCard, VisualizationDisplay } from "metabase-types/api";

import { isVisualizerDashboardCard } from "./is-visualizer-dashboard-card";

export const DEFAULT_VISUALIZER_DISPLAY = "bar";

export function dashboardCardSupportsVisualizer(dashcard: DashboardCard) {
  if (isVisualizerDashboardCard(dashcard)) {
    return visualizations.get(
      (dashcard!.visualization_settings!.visualization as any).display,
    )?.supportsVisualizer;
  }

  return isVisualizerSupportedVisualization(dashcard.card.display);
}

export function isVisualizerSupportedVisualization(
  display: VisualizationDisplay | null | undefined,
) {
  if (!display) {
    return false;
  }

  return visualizations.get(display)?.supportsVisualizer;
}

export function isDisabledForVisualizer(
  display: VisualizationDisplay | null | undefined,
) {
  if (!display) {
    return false;
  }

  return visualizations.get(display)?.disableVisualizer;
}
