import { t } from "ttag";

import type { VisualizationProps } from "../types";
import { RowChartLegendLayout } from "../visualizations/RowChart/RowChart.styled";
import { EChartsRenderer } from "./EChartsRenderer";
import {
  clickActionsMixin,
  lineSeriesMixin,
  smoothSettingMixin,
  tooltipMixin,
  useEChartsConfig,
} from "./mixins";

Object.assign(EChartsTest, {
  uiName: "ECharts",
  identifier: "echarts",
  iconName: "dyno",
  settings: {
    smooth: {
      section: t`Display`,
      title: t`Smooth`,
      index: 0,
      inline: true,
      widget: "toggle",
      default: false,
    },
  },
});

export function EChartsTest(props: VisualizationProps) {
  const config = useEChartsConfig({
    chartType: "line",
    props,
    mixins: [
      clickActionsMixin,
      tooltipMixin,
      lineSeriesMixin,
      smoothSettingMixin,
    ],
  });

  return (
    <RowChartLegendLayout
      labels={["one", "two", "three"]}
      colors={["red", "green", "blue"]}
      hasLegend={true}
    >
      <EChartsRenderer
        config={config}
        width={props.width}
        height={props.height}
      />
    </RowChartLegendLayout>
  );
}
