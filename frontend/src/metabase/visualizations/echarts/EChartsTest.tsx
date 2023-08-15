import { t } from "ttag";

import type { VisualizationProps } from "../types";
import { EChartsRenderer } from "./EChartsRenderer";
import {
  clickActionsMixin,
  lineSeriesMixin,
  smoothSettingMixin,
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
    data: props.data,
    settings: props.settings,
    mixins: [clickActionsMixin, lineSeriesMixin, smoothSettingMixin],
  });

  return (
    <EChartsRenderer
      config={config}
      width={props.width}
      height={props.height}
    />
  );
}
