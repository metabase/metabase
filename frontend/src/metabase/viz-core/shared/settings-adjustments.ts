import type {
  ComputedVisualizationSettings,
  VisualizationGridSize,
} from "../types";

// Thresholds prioritize grid size when available so that dashboards in the FE
// and dashboard PDFs in the BE compute the same settings

interface Threshold {
  gridWidth?: number;
  gridHeight?: number;
  pixelWidth?: number;
  pixelHeight?: number;
}

const HIDE_Y_AXIS_THRESHOLD: Threshold = {
  gridHeight: 4,
  pixelHeight: 150,
};

const HIDE_AXIS_LABELS_THRESHOLD: Threshold = {
  gridWidth: 12,
  gridHeight: 6,
  pixelWidth: 500,
  pixelHeight: 250,
};

const INTERPOLATE_LINE_THRESHOLD: Threshold = {
  gridWidth: 4,
  gridHeight: 4,
  pixelWidth: 150,
  pixelHeight: 150,
};

const isBelowThreshold = (
  threshold: Threshold,
  width: number,
  height: number,
  gridSize?: VisualizationGridSize,
) => {
  if (gridSize) {
    return (
      (threshold.gridWidth != null && gridSize.width < threshold.gridWidth) ||
      (threshold.gridHeight != null && gridSize.height < threshold.gridHeight)
    );
  }
  return (
    (threshold.pixelWidth != null && width < threshold.pixelWidth) ||
    (threshold.pixelHeight != null && height < threshold.pixelHeight)
  );
};

type GetSizeAdjustedSettingsOpts = {
  settings: ComputedVisualizationSettings;
  width: number;
  height: number;
  gridSize?: VisualizationGridSize;
};

export const getSizeAdjustedSettings = ({
  settings,
  width,
  height,
  gridSize,
}: GetSizeAdjustedSettingsOpts): ComputedVisualizationSettings => {
  const adjusted = { ...settings };

  if (isBelowThreshold(INTERPOLATE_LINE_THRESHOLD, width, height, gridSize)) {
    adjusted["line.interpolate"] = "cardinal";
  }

  const shouldHideAxisLabels = isBelowThreshold(
    HIDE_AXIS_LABELS_THRESHOLD,
    width,
    height,
    gridSize,
  );

  if (adjusted["graph.y_axis.labels_enabled"] === "auto") {
    adjusted["graph.y_axis.labels_enabled"] = !shouldHideAxisLabels;
  }

  if (adjusted["graph.x_axis.labels_enabled"] === "auto") {
    adjusted["graph.x_axis.labels_enabled"] = !shouldHideAxisLabels;
  }

  if (isBelowThreshold(HIDE_Y_AXIS_THRESHOLD, width, height, gridSize)) {
    adjusted["graph.y_axis.axis_enabled"] = false;
  }

  return adjusted;
};
