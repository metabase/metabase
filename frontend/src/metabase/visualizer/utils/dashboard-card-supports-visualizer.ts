import visualizations from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

export const DEFAULT_VISUALIZER_DISPLAY = "bar";

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
