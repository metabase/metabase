import type { StaticChartProps } from "../StaticVisualization";

import { PieChartWithBottomLegend } from "./PieChartWithBottomLegend";
import { PieChartWithSideLegend } from "./PieChartWithSideLegend";

export function PieChart(props: StaticChartProps) {
  const { width, height } = props;
  // A square-or-wider box fits the legend beside the circle (like the app); a taller box, or an
  // email (which passes no dimensions), puts it below.
  if (width != null && height != null && width >= height) {
    return <PieChartWithSideLegend {...props} width={width} height={height} />;
  }
  return <PieChartWithBottomLegend {...props} />;
}
