import type {
  ComputedVisualizationSettings,
  VisualizationGridSize,
} from "metabase/visualizations/types";

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

export const getGridSizeAdjustedSettings = (
  settings: ComputedVisualizationSettings,
  gridSize?: VisualizationGridSize,
) => {
  const fidelity = getFidelity(gridSize);
  const newSettings = { ...settings };

  // smooth interpolation at smallest x/y fidelity
  if (fidelity.x === 0 && fidelity.y === 0) {
    newSettings["line.interpolate"] = "cardinal";
  }

  // no axis in < 1 fidelity
  if (fidelity.x < 1 || fidelity.y < 1) {
    newSettings["graph.y_axis.axis_enabled"] = false;
  }

  // no labels in < 2 fidelity
  if (fidelity.x < 2 || fidelity.y < 2) {
    newSettings["graph.y_axis.labels_enabled"] = false;
  }

  return newSettings;
};
