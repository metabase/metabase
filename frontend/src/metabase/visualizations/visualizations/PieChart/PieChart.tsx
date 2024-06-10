import type { VisualizationProps } from "metabase/visualizations/types";

import { PIE_CHART_DEFINITION } from "./chart-definition";

Object.assign(PieChart, PIE_CHART_DEFINITION);

export function PieChart(props: VisualizationProps) {
  // eslint-disable-next-line
  console.log("props", props);
  return <div>hi</div>;
}
