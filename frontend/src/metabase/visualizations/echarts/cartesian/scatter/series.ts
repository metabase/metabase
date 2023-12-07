import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { SeriesSettings } from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { SeriesModel } from "../model/types";
import { buildEChartsLabelOptions } from "../option/series";

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["scatter"] {
  return {
    type: "scatter",
    yAxisIndex,
    symbolSize: 8, // TODO update this and other styles
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(seriesModel, settings, renderingContext),
    itemStyle: {
      color: seriesModel.color,
    },
  };
}
