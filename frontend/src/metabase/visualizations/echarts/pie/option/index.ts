import type { EChartsOption } from "echarts";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { PieChartModel } from "../model/types";
import { SUNBURST_SERIES_OPTIONS } from "./constants";

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
