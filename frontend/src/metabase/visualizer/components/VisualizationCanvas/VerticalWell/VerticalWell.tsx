import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import { FunnelVerticalWell } from "./FunnelVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
}

export function VerticalWell({ display, ...props }: VerticalWellProps) {
  if (display === "funnel") {
    return <FunnelVerticalWell {...props} />;
  }
  return null;
}
