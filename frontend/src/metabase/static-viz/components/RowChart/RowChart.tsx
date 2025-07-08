import { ComboChart } from "../ComboChart/ComboChart";
import type { StaticChartProps } from "../StaticVisualization";

export function RowChart(props: StaticChartProps) {
  return <ComboChart {...props} />;
}
