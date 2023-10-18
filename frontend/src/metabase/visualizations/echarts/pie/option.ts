import type { EChartsOption, RegisteredSeriesOption } from "echarts";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { PieChartModel } from "./model/types";

// static, non-computed values
const SUNBURST_SERIES_OPTIONS: RegisteredSeriesOption["sunburst"] = {
  type: "sunburst",
  sort: undefined,
  label: {
    rotate: 0,
    overflow: "none",
    lineHeight: 50, // TODO update this later
    fontSize: 16, // TODO update this later
    color: "white", // TODO select color dynamically based on contrast with slice color
  },
  radius: ["60%", "90%"], // TODO compute this dynamically based on side length like in PieChart.jsx
};

export function getPieChartOption(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption {
  return {
    textStyle: {
      fontFamily: renderingContext.fontFamily,
    },
    series: {
      ...SUNBURST_SERIES_OPTIONS,
      data: chartModel.slices.map(s => ({
        value: s.value,
        name: s.key,
        itemStyle: { color: s.color },
      })),
    },
  };
}
