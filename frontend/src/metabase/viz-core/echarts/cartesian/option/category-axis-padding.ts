import { parseNumberValue } from "metabase/utils/number";
import { isNumericBaseType } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import type { ChartLayout, DashboardXAxis } from "../layout/types";
import type { CategoryXAxisModel } from "../model/types";

import { getXAxisLabelValues } from "./x-axis-labels";
import { getDashboardXAxisLayout } from "./x-axis-padding";

export function getCategoryAxisPadding(
  axis: CategoryXAxisModel,
  chartLayout: ChartLayout,
  column?: DatasetColumn,
): DashboardXAxis | undefined {
  const values = axis.positions?.values;
  if (!axis.isDashboard || !values || values.length < 2) {
    return undefined;
  }

  const min = axis.isHistogram ? 0.5 : 0;
  const max = axis.isHistogram ? values.length - 1.5 : values.length - 1;
  const formatLabel = (position: number) => {
    const index = axis.isHistogram ? Math.ceil(position) : position;
    const value = values[index];
    const number = typeof value === "string" ? parseNumberValue(value) : null;
    if (column && isNumericBaseType(column) && number !== null) {
      return axis.formatter(number);
    }
    return axis.formatter(value);
  };
  const layout = getDashboardXAxisLayout(
    [min, max],
    axis.isHistogram ? { ...chartLayout, xAxisMarkWidthRatio: 0 } : chartLayout,
    formatLabel(min),
    formatLabel(max),
    max - min,
  );
  if (!layout) {
    return undefined;
  }

  const { extent, step, axisWidth, padding } = layout;
  const customValues = getXAxisLabelValues({
    centerEndpoints: layout.centerLabels,
    valuesCount: max - min + 1,
    getValue: (index) => min + index,
    getPosition: (value) =>
      ((value - extent[0]) / (extent[1] - extent[0])) * axisWidth,
    formatLabel,
    getLabelWidth: chartLayout.ticksDimensions.getXTickWidth,
    axisWidth,
    padding,
  });
  if (!customValues) {
    return undefined;
  }

  return {
    step,
    options: {
      type: "value",
      scale: true,
      min: extent[0],
      max: extent[1],
      containShape: false,
      axisLabel: {
        customValues,
        formatter: formatLabel,
        ...layout.axisLabel,
        hideOverlap: false,
        showMinLabel: true,
        showMaxLabel: true,
      },
    },
  };
}
