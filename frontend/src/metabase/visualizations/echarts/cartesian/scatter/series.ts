import d3 from "d3";
import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { RenderingContext } from "metabase/visualizations/types";

import type {
  DataKey,
  Datum,
  GroupedDataset,
  SeriesModel,
} from "../model/types";

const BUBBLE_SCALE_FACTOR_MAX = 64;

function getBubbleSizeScale(
  dataset: GroupedDataset,
  bubbleSizeDataKey: DataKey | undefined,
) {
  if (!bubbleSizeDataKey) {
    return 8; // TODO confirm with design
  }

  const bubbleSizeDomainMax = d3.max(
    dataset
      .map(datum => Number(datum[bubbleSizeDataKey]))
      .filter(value => !Number.isNaN(value)),
  );
  const scale = d3.scale
    .sqrt()
    .domain([0, bubbleSizeDomainMax * BUBBLE_SCALE_FACTOR_MAX]) // TODO figure out if we need to keep scale factor
    .range([1, 100]); // TODO ask design what are reasonable

  return (datum: Datum) => scale(Number(datum[bubbleSizeDataKey]));
}

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  dataset: GroupedDataset,
  dimensionDataKey: DataKey,
  bubbleSizeDataKey: DataKey | undefined,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["scatter"] {
  // TODO styles
  return {
    type: "scatter",
    yAxisIndex,
    symbolSize: getBubbleSizeScale(dataset, bubbleSizeDataKey),
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
