import { t } from "ttag";

import type { VisualizationProps } from "../types";
import { EChartsRenderer } from "./EChartsRenderer";
import {
  lineSeriesMixin,
  smoothSettingMixin,
  useEChartsMixins,
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
  const option = useEChartsMixins({
    chartType: "line",
    data: props.data,
    settings: props.settings,
    mixins: [lineSeriesMixin, smoothSettingMixin],
  });

  return (
    <EChartsRenderer
      echartsOption={option}
      width={props.width}
      height={props.height}
    />
  );
}
