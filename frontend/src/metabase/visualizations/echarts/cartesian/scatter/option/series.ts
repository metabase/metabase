import d3 from "d3";
import type { ScatterSeriesOption } from "echarts/charts";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { RenderingContext } from "metabase/visualizations/types";

import { CHART_STYLE, Z_INDEXES } from "../../constants/style";
import type { DataKey, Datum, Extent, SeriesModel } from "../../model/types";

const MIN_BUBBLE_DIAMETER = 15;
const MAX_BUBBLE_DIAMETER = 75;

/**
 * Returns a function that takes in a datum, and returns a scaled
 * diameter size based on the bubble size column the user has selected.
 * We return diameter since that's what ECharts uses for its `symbolSize` option.
 *
 * The function scales linearly based on area to provide an accurate representation
 * of the data (see https://www.data-to-viz.com/caveat/radius_or_area.html for rationale).
 */
function getBubbleDiameterScale(
  bubbleSizeDomain: Extent | null,
  bubbleSizeDataKey: DataKey | undefined,
) {
  if (!bubbleSizeDataKey || !bubbleSizeDomain) {
    return MIN_BUBBLE_DIAMETER;
  }
  const areaRange = [MIN_BUBBLE_DIAMETER, MAX_BUBBLE_DIAMETER].map(
    diameter => Math.PI * (diameter / 2) ** 2,
  );
  // Domain is [0, 1] since the `t` parameteter of the interpolate function below
  // is normalized to 0-1.
  const areaScale = d3.scale.linear().domain([0, 1]).range(areaRange);

  const scale = d3.scale
    .linear()
    .domain(bubbleSizeDomain)
    // D3 will take a value from the domain (bubble size column) and normalize it (`t` is between 0,1).
    // Then we plug the normalized value `t` into the `areaScale` to get the corrseponding area for that diameter.
    // We then take this area and convert it back to a diameter value
    // if area = π × (diameter ÷ 2)², then diameter = (2 × √area) ÷ π
    .interpolate((_, _2) => t => (2 * Math.sqrt(areaScale(t))) / Math.PI)
    // Finally, D3 linearly maps that value into our defined min/max range.
    .range([MIN_BUBBLE_DIAMETER, MAX_BUBBLE_DIAMETER]);

  return (datum: Datum) => scale(Number(datum[bubbleSizeDataKey]));
}

export function buildEChartsScatterSeries(
  seriesModel: SeriesModel,
  bubbleSizeDomain: Extent | null,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): ScatterSeriesOption {
  const bubbleSizeDataKey =
    "bubbleSizeDataKey" in seriesModel
      ? seriesModel.bubbleSizeDataKey
      : undefined;
  return {
    id: seriesModel.dataKey,
    type: "scatter",
    yAxisIndex,
    symbolSize: getBubbleDiameterScale(bubbleSizeDomain, bubbleSizeDataKey),
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    z: Z_INDEXES.series,
    itemStyle: {
      color: seriesModel.color,
      opacity: CHART_STYLE.opacity.scatter,
      borderColor: renderingContext.getColor("white"),
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
  };
}
