import { isCartesianChart } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { CartesianVerticalWell } from "./CartesianVerticalWell";
import { FunnelVerticalWell } from "./FunnelVerticalWell";
import { PieVerticalWell } from "./PieVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
}

export function VerticalWell({ display }: VerticalWellProps) {
  if (isCartesianChart(display)) {
    return <CartesianVerticalWell />;
  }

  switch (display) {
    case "funnel":
      return <FunnelVerticalWell />;
    case "pie":
      return <PieVerticalWell />;
  }

  return null;
}
