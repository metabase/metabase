import type { FlexProps } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { FunnelHorizontalWell } from "./FunnelHorizontalWell";

interface HorizontalWellProps extends FlexProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (settings: VisualizationSettings) => void;
}

export function HorizontalWell({ display, ...props }: HorizontalWellProps) {
  if (display === "funnel") {
    return <FunnelHorizontalWell {...props} />;
  }
  return null;
}
