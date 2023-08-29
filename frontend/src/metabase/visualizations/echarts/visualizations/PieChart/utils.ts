import { useState } from "react";
import _ from "underscore";
import { t } from "ttag";

import type { IsomorphicVizProps } from "metabase/visualizations/types";
// import {
//   DEFAULT_SLICE_THRESHOLD,
//   OTHER_SLICE_MIN_PERCENTAGE,
// } from "metabase/visualizations/visualizations/PieChart/constants";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";

// TODO import these from constants after fixing webpack shenanegians
const DEFAULT_SLICE_THRESHOLD = 0.025;
const OTHER_SLICE_MIN_PERCENTAGE = 0.003;

export function getDimensionIndex(props: IsomorphicVizProps) {
  return props.settings["pie._dimensionIndex"];
}

export function getMetricIndex(props: IsomorphicVizProps) {
  return props.settings["pie._metricIndex"];
}

// TODO fix type errors
export function getSlices({ props }: { props: IsomorphicVizProps }) {
  const {
    settings,
    data: { rows },
  } = props;
  const metricIndex = getMetricIndex(props);
  const dimensionIndex = getDimensionIndex(props);

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

export type OnChartDimensionChange = (args: {
  width: number | undefined;
  height: number | undefined;
}) => void;

export function useChartDimension() {
  const [sideLength, setSideLength] = useState<number>();

  const onChartDimensionChange: OnChartDimensionChange = ({
    width,
    height,
  }) => {
    setSideLength(Math.max(width ?? 0, height ?? 0));
  };

  return {
    sideLength: sideLength ?? ("auto" as const),
    onChartDimensionChange,
  };
}

export function formatDimension({
  value,
  props,
}: {
  value: any;
  props: IsomorphicVizProps;
}) {
  const dimensionIndex = getDimensionIndex(props);

  return formatValue(value, {
    ...props.settings.column?.(props.data.cols[dimensionIndex]),
    jsx: true,
    majorWidth: 0,
  });
}

export function formatMetric({
  value,
  props,
}: {
  value: any;
  props: IsomorphicVizProps;
}) {
  const metricIndex = getMetricIndex(props);

  return formatValue(value, {
    ...props.settings.column?.(props.data.cols[metricIndex]),
    jsx: true,
    majorWidth: 0,
  });
}
