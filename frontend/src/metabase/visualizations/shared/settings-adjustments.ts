import type {
  ComputedVisualizationSettings,
  VisualizationGridSize,
} from "metabase/visualizations/types";

const HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD = 360;
const HIDE_Y_AXIS_LABEL_HEIGHT_THRESHOLD = 200;

const getFidelity = (gridSize?: VisualizationGridSize) => {
  const fidelity = { x: 0, y: 0 };
  const size = gridSize || { width: Infinity, height: Infinity };
  if (size.width >= 5) {
    fidelity.x = 2;
  } else if (size.width >= 4) {
    fidelity.x = 1;
  }
  if (size.height >= 5) {
    fidelity.y = 2;
  } else if (size.height >= 4) {
    fidelity.y = 1;
  }

  return fidelity;
};

export const getDashboardAdjustedSettings = (
  settings: ComputedVisualizationSettings,
  isDashboard: boolean,
  width: number,
  height: number,
  gridSize?: VisualizationGridSize,
): ComputedVisualizationSettings => {
  if (!isDashboard) {
    return settings;
  }

  const fidelity = getFidelity(gridSize);
  const adjusted = { ...settings };

  // smooth interpolation at smallest x/y fidelity
  if (fidelity.x === 0 && fidelity.y === 0) {
    adjusted["line.interpolate"] = "cardinal";
  }

  // no axis in < 1 fidelity
  if (fidelity.x < 1 || fidelity.y < 1) {
    adjusted["graph.y_axis.axis_enabled"] = false;
  }

  // no labels in < 2 fidelity
  if (fidelity.x < 2 || fidelity.y < 2) {
    adjusted["graph.y_axis.labels_enabled"] = false;
  }

  // hide labels when chart is too small
  if (width <= HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD) {
    adjusted["graph.y_axis.labels_enabled"] = false;
  }
  if (height <= HIDE_Y_AXIS_LABEL_HEIGHT_THRESHOLD) {
    adjusted["graph.x_axis.labels_enabled"] = false;
  }

  return adjusted;
};
