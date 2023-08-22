import _ from "underscore";
import { t } from "ttag";

import type { VisualizationProps } from "metabase/visualizations/types";
import {
  DEFAULT_SLICE_THRESHOLD,
  OTHER_SLICE_MIN_PERCENTAGE,
} from "metabase/visualizations/visualizations/PieChart/constants";
import { color } from "metabase/lib/colors";

// TODO fix type errors
export function getSlices({ props }: { props: VisualizationProps }) {
  const {
    settings,
    data: { rows },
  } = props;
  const metricIndex = settings["pie._metricIndex"];
  const dimensionIndex = settings["pie._dimensionIndex"];

  const total = rows.reduce((sum, row) => sum + row[metricIndex], 0);

  const sliceThreshold =
    typeof settings["pie.slice_threshold"] === "number"
      ? settings["pie.slice_threshold"] / 100
      : DEFAULT_SLICE_THRESHOLD;

  const [slices, others] = _.chain(rows)
    .map((row, index) => ({
      // TODO remove the unused properties here
      key: row[dimensionIndex],
      // Value is used to determine arc size and is modified for very small
      // other slices. We save displayValue for use in tooltips.
      value: row[metricIndex],
      displayValue: row[metricIndex],
      percentage: row[metricIndex] / total,
      rowIndex: index,
      color: settings["pie._colors"][row[dimensionIndex]],
    }))
    .partition(d => d.percentage > sliceThreshold)
    .value();

  const otherTotal = others.reduce((acc, o) => acc + o.value, 0);
  // Multiple others get squashed together under the key "Other"
  const otherSlice =
    others.length === 1
      ? others[0]
      : {
          key: t`Other`,
          value: otherTotal,
          percentage: otherTotal / total,
          color: color("text-light"),
        };
  if (otherSlice.value > 0) {
    // increase "other" slice so it's barely visible
    if (otherSlice.percentage < OTHER_SLICE_MIN_PERCENTAGE) {
      otherSlice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
    }
    slices.push(otherSlice);
  }

  return slices;
}
