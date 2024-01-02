import d3 from "d3";
import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { RenderingContext } from "metabase/visualizations/types";

import type {
  DataKey,
  Datum,
  Extent,
  GroupedDataset,
  SeriesModel,
} from "../model/types";

const MIN_BUBBLE_SIZE = 14;
const MAX_BUBBLE_SIZE = 64;

function getBubbleSizeScale(
  bubbleSizeDomain: Extent | null,
  bubbleSizeDataKey: DataKey | undefined,
) {
  if (!bubbleSizeDataKey || !bubbleSizeDomain) {
    return MIN_BUBBLE_SIZE;
  }

  const scale = d3.scale
    .sqrt()
    .domain(bubbleSizeDomain)
    .range([MIN_BUBBLE_SIZE, MAX_BUBBLE_SIZE]);
  return (datum: Datum) => scale(Math.abs(Number(datum[bubbleSizeDataKey])));
}

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  bubbleSizeDomain: Extent | null,
  dataset: GroupedDataset,
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
