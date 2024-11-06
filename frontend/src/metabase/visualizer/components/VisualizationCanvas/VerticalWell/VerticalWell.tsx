import { useSelector } from "metabase/lib/redux";
import { isCartesianChart } from "metabase/visualizations";
import { getVisualizerMetricColumn } from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

interface VerticalWellProps {
  display: VisualizationDisplay;
}

export function VerticalWell({ display }: VerticalWellProps) {
  const metric = useSelector(getVisualizerMetricColumn);
  const name = metric?.column?.display_name ?? "Metric";
  if (isCartesianChart(display)) {
    return <SimpleVerticalWell name={name} />;
  }
  if (display === "funnel") {
    return <SimpleVerticalWell name={name} />;
  }
  return null;
}
