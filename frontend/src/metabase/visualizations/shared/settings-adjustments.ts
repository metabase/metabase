import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

const HIDE_Y_AXIS_LABEL_WIDTH_THRESHOLD = 360;
const HIDE_X_AXIS_LABEL_HEIGHT_THRESHOLD = 200;
const HIDE_Y_AXIS_HEIGHT_THRESHOLD = 150;
const INTERPOLATE_LINE_THRESHOLD = 150;
const HIDE_TIMELINE_EVENTS_HEIGHT_THRESHOLD = 200;
const HIDE_TIMELINE_EVENTS_WIDTH_THRESHOLD = 240;

type getAdjustedSettingsProps = {
  settings: ComputedVisualizationSettings;
  width: number;
  height: number;
};

export const getDashboardAdjustedSettings = ({
  settings,
  width,
  height,
}: getAdjustedSettingsProps): ComputedVisualizationSettings => {
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

  if (
    height <= HIDE_TIMELINE_EVENTS_HEIGHT_THRESHOLD ||
    width <= HIDE_TIMELINE_EVENTS_WIDTH_THRESHOLD
  ) {
    adjusted["timeline.selected_timeline_ids"] = [];
  }

  return adjusted;
};
