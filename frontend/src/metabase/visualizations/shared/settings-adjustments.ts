import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

const HIDE_Y_AXIS_LABEL_WIDTH_THRESHOLD = 360;
const HIDE_X_AXIS_LABEL_HEIGHT_THRESHOLD = 200;
const HIDE_Y_AXIS_HEIGHT_THRESHOLD = 150;
const INTERPOLATE_LINE_THRESHOLD = 150;

export const getDashboardAdjustedSettings = (
  settings: ComputedVisualizationSettings,
  isDashboard: boolean,
  width: number,
  height: number,
): ComputedVisualizationSettings => {
  if (!isDashboard) {
    return settings;
  }

  const adjusted = { ...settings };

  if (
    width <= INTERPOLATE_LINE_THRESHOLD ||
    height <= INTERPOLATE_LINE_THRESHOLD
  ) {
    adjusted["line.interpolate"] = "cardinal";
  }

  if (width <= HIDE_Y_AXIS_LABEL_WIDTH_THRESHOLD) {
    adjusted["graph.y_axis.labels_enabled"] = false;
  }

  if (height <= HIDE_X_AXIS_LABEL_HEIGHT_THRESHOLD) {
    adjusted["graph.x_axis.labels_enabled"] = false;
  }

  if (height <= HIDE_Y_AXIS_HEIGHT_THRESHOLD) {
    adjusted["graph.y_axis.axis_enabled"] = false;
  }

  return adjusted;
};
