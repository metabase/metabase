import type { ScatterSeriesOption } from "echarts/charts";

import type { Extent, RenderingContext } from "../../../../types";
import { X_AXIS_DATA_KEY } from "../../constants/dataset";
import { CHART_STYLE, Z_INDEXES } from "../../constants/style";
import type { SeriesModel } from "../../model/types";
import { getBubbleDiameterScale } from "../model/bubble-size";

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  bubbleSizeDomain: Extent | null,
  yAxisIndex: number,
  renderingContext: RenderingContext,
  xAxisIndex?: number,
): ScatterSeriesOption {
  const bubbleSizeDataKey =
    "bubbleSizeDataKey" in seriesModel
      ? seriesModel.bubbleSizeDataKey
      : undefined;
  return {
    id: seriesModel.dataKey,
    type: "scatter",
    yAxisIndex,
    ...(xAxisIndex != null ? { xAxisIndex } : {}),
    symbolSize: getBubbleDiameterScale(bubbleSizeDomain, bubbleSizeDataKey),
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    z: Z_INDEXES.series,
    itemStyle: {
      color: seriesModel.color,
      opacity: CHART_STYLE.opacity.scatter,
      borderColor: renderingContext.getColor("background_page-primary"),
      borderWidth: 1,
    },
    emphasis: {
      focus: "series", // there is no blur for single series scatter plot
    },
    blur: {
      itemStyle: {
        opacity: CHART_STYLE.opacity.blur,
      },
    },
    progressive: 0,
  };
}
