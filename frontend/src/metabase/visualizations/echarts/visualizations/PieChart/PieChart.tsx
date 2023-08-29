import { PIE_CHART_SETTINGS } from "metabase/visualizations/visualizations/PieChart/constants";
import type { IsomorphicVizProps } from "metabase/visualizations/types";
import { PieChartShared } from "./PieChartShared";

Object.assign(PieChart, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
  settings: PIE_CHART_SETTINGS,
});

export function PieChart(props: IsomorphicVizProps) {
  return <PieChartShared {...props} />;
}
