import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
}

export function VerticalWell({ display, settings }: VerticalWellProps) {
  if (display === "funnel") {
    const name = settings["funnel.metric"];
    return <SimpleVerticalWell name={name} />;
  }
  return null;
}
