import { visualizations } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

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
