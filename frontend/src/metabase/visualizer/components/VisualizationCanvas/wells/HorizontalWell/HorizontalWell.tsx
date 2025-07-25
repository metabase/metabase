import type { FlexProps } from "metabase/ui";
import { isCartesianChart } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { CartesianHorizontalWell } from "./CartesianHorizontallWell";
import { FunnelHorizontalWell } from "./FunnelHorizontalWell";

interface HorizontalWellProps extends FlexProps {
  display: VisualizationDisplay;
}

export function HorizontalWell({ display, ...props }: HorizontalWellProps) {
  if (isCartesianChart(display)) {
    return <CartesianHorizontalWell {...props} />;
  }
  if (display === "funnel") {
    return <FunnelHorizontalWell {...props} />;
  }
  return null;
}
