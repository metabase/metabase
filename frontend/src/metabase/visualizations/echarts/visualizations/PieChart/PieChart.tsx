import { PIE_CHART_SETTINGS } from "metabase/visualizations/visualizations/PieChart/constants";
import type { VisualizationProps } from "metabase/visualizations/types";

import { EChartsRenderer } from "../../EChartsRenderer";
import { useEChartsConfig } from "../../use-echarts-config";
import {
  pieSeriesMixin,
  totalMixin,
  showPercentagesOnChartMixin,
} from "./mixins";

Object.assign(PieChart, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
  settings: PIE_CHART_SETTINGS,
});

export function PieChart(props: VisualizationProps) {
  const config = useEChartsConfig({
    chartType: "pie",
    props,
    mixins: [pieSeriesMixin, showPercentagesOnChartMixin, totalMixin],
  });

  return (
    <EChartsRenderer
      config={config}
      width={props.width}
      height={props.height}
    />
  );
}
