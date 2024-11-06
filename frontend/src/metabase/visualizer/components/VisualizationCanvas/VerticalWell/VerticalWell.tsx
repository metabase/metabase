import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
}

export function VerticalWell({ display, settings }: VerticalWellProps) {
  if (isCartesianChart(display)) {
    const name = settings["graph.metrics"]?.[0] ?? "";
    return <SimpleVerticalWell name={name} />;
  }
  if (display === "funnel") {
    const name = settings["funnel.metric"];
    return <SimpleVerticalWell name={name} />;
  }
  return null;
}
