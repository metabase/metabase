import { isCartesianChart } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { CartesianVerticalWell } from "./CartesianVerticalWell";
import { FunnelVerticalWell } from "./FunnelVerticalWell";
import { MapVerticalWell } from "./MapVerticalWell";
import { PieVerticalWell } from "./PieVerticalWell";
import { PivotVerticalWell } from "./PivotVerticalWell";

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
    case "pivot":
      return <PivotVerticalWell />;
    case "map":
      return <MapVerticalWell />;
  }

  return null;
}
