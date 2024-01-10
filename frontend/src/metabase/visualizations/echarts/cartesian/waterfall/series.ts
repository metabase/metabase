import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { DataKey, SeriesModel } from "../model/types";

export function buildEChartsWaterfallSeries(
  seriesModel: SeriesModel,
  dimensionDataKey: DataKey,
  yAxisIndex: number,
): RegisteredSeriesOption["bar"] {
  return {
    type: "bar",
    yAxisIndex,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
  };
}
