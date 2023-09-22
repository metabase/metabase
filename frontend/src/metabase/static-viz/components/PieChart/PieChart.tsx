import type { StaticChartProps } from "metabase/static-viz/types";
import { EChartsRenderer } from "metabase/visualizations/echarts/EChartsRenderer";
import { useEChartsConfig } from "metabase/visualizations/echarts/use-echarts-config";
import {
  pieSeriesMixin,
  showPercentagesOnChartMixin,
  totalMixin,
} from "metabase/visualizations/echarts/visualizations/PieChart/mixins";

export const PieChart = (props: StaticChartProps) => {
  const config = useEChartsConfig({
    chartType: "pie",
    props,
    mixins: [pieSeriesMixin, showPercentagesOnChartMixin, totalMixin],
  });

  return <EChartsRenderer config={config} width={500} height={500} />;
};
