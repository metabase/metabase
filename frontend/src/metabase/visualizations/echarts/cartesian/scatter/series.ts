import d3 from "d3";
import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { RenderingContext } from "metabase/visualizations/types";

import type {
  DataKey,
  Datum,
  Extent,
  ChartDataset,
  SeriesModel,
} from "../model/types";

const BUBBLE_SCALE_FACTOR_MAX = 64;

const MIN_BUBBLE_SIZE = 14;

// TODO: refine the scaling curve when implementing the dynamic scatter plot
function getBubbleSizeScale(
  bubbleSizeDomain: Extent | null,
  bubbleSizeDataKey: DataKey | undefined,
) {
  if (!bubbleSizeDataKey || !bubbleSizeDomain) {
    return MIN_BUBBLE_SIZE;
  }

  const scale = d3.scale
    .sqrt()
    .domain(bubbleSizeDomain.map(v => v * BUBBLE_SCALE_FACTOR_MAX))
    .range([MIN_BUBBLE_SIZE, 1024]);
  return (datum: Datum) => scale(Number(datum[bubbleSizeDataKey]));
}

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  bubbleSizeDomain: Extent | null,
  dataset: ChartDataset,
  dimensionDataKey: DataKey,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["scatter"] {
  const bubbleSizeDataKey =
    "bubbleSizeDataKey" in seriesModel
      ? seriesModel.bubbleSizeDataKey
      : undefined;
  return {
    id: seriesModel.dataKey,
    type: "scatter",
    yAxisIndex,
    symbolSize: getBubbleSizeScale(bubbleSizeDomain, bubbleSizeDataKey),
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
