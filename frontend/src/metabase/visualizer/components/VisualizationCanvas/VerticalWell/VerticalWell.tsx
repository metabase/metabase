import { isCartesianChart } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { CartesianVerticalWell } from "./CartesianVerticalWell";
import { FunnelVerticalWell } from "./FunnelVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
}

export function VerticalWell({ display }: VerticalWellProps) {
  if (isCartesianChart(display)) {
    return <CartesianVerticalWell />;
  }
  if (display === "funnel") {
    return <FunnelVerticalWell />;
  }
  return null;
}
