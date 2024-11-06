import type { FlexProps } from "metabase/ui";
import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { CartesianHorizontalWell } from "./CartesianHorizontallWell";
import { FunnelHorizontalWell } from "./FunnelHorizontalWell";

interface HorizontalWellProps extends FlexProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (settings: VisualizationSettings) => void;
}

export function HorizontalWell({
  display,
  onChangeSettings,
  ...props
}: HorizontalWellProps) {
  if (isCartesianChart(display)) {
    return <CartesianHorizontalWell {...props} />;
  }
  if (display === "funnel") {
    return (
      <FunnelHorizontalWell {...props} onChangeSettings={onChangeSettings} />
    );
  }
  return null;
}
