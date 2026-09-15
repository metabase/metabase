import * as d3 from "d3";

import type { Extent } from "../../../../types";
import type { DataKey, Datum } from "../../model/types";

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
export function getBubbleDiameterScale(
  bubbleSizeDomain: Extent | null,
  bubbleSizeDataKey: DataKey | undefined,
) {
  if (!bubbleSizeDataKey || !bubbleSizeDomain) {
    return MIN_BUBBLE_DIAMETER;
  }
  const areaRange = [MIN_BUBBLE_DIAMETER, MAX_BUBBLE_DIAMETER].map(
    (diameter) => Math.PI * (diameter / 2) ** 2,
  );
  // Domain is [0, 1] since the `t` parameteter of the interpolate function below
  // is normalized to 0-1.
  const areaScale = d3.scaleLinear([0, 1], areaRange);

  const scale = d3
    .scaleLinear()
    .domain(bubbleSizeDomain)
    // D3 will take a value from the domain (bubble size column) and normalize it (`t` is between 0,1).
    // Then we plug the normalized value `t` into the `areaScale` to get the corresponding area for that diameter.
    // We then take this area and convert it back to a diameter value
    // if area = π × (diameter ÷ 2)², then diameter = 2 × √(area ÷ π)
    .interpolate(() => (t) => 2 * Math.sqrt(areaScale(t) / Math.PI))
    // Finally, D3 linearly maps that value into our defined min/max range.
    .range([MIN_BUBBLE_DIAMETER, MAX_BUBBLE_DIAMETER]);

  return (datum: Datum) => scale(Number(datum[bubbleSizeDataKey]));
}
