import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import { CartesianVerticalWell } from "./CartesianVerticalWell";
import { FunnelVerticalWell } from "./FunnelVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
}

export function VerticalWell({ display, settings }: VerticalWellProps) {
  if (isCartesianChart(display)) {
    return <CartesianVerticalWell settings={settings} />;
  }
  if (display === "funnel") {
    return <FunnelVerticalWell settings={settings} />;
  }
  return null;
}
