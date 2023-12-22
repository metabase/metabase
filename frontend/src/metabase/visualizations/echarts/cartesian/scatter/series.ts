import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { RenderingContext } from "metabase/visualizations/types";

import type { SeriesModel } from "../model/types";

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  dimensionDataKey: string,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["scatter"] {
  return {
    type: "scatter",
    yAxisIndex,
    symbolSize: 8, // TODO implement bubble size setting
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    itemStyle: {
      color: seriesModel.color,
      opacity: 0.8,
      borderColor: renderingContext.getColor("white"),
      borderWidth: 1,
    },
  };
}
