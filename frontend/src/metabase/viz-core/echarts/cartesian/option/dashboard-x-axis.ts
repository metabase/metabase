import type { DatasetColumn } from "metabase-types/api";

import { X_AXIS_DATA_KEY, X_AXIS_POSITION_KEY } from "../constants/dataset";
import type { ChartLayout, DashboardXAxis } from "../layout/types";
import type { XAxisModel } from "../model/types";

import { getCategoryAxisPadding } from "./category-axis-padding";
import { getNumericAxisPadding } from "./numeric-axis-padding";
import { getTimeAxisPadding } from "./time-axis-padding";

export function getDashboardXAxis(
  axis: XAxisModel,
  chartLayout: ChartLayout,
  column?: DatasetColumn,
): DashboardXAxis | undefined {
  if (!axis.isDashboard) {
    return undefined;
  }
  if (axis.axisType === "category") {
    return getCategoryAxisPadding(axis, chartLayout, column);
  }
  if (axis.axisType === "time") {
    return getTimeAxisPadding(axis, chartLayout);
  }
  return getNumericAxisPadding(axis, chartLayout);
}

export function getXAxisDataKey(axis: XAxisModel, chartLayout?: ChartLayout) {
  return axis.axisType === "category" && chartLayout?.dashboardXAxis
    ? X_AXIS_POSITION_KEY
    : X_AXIS_DATA_KEY;
}
