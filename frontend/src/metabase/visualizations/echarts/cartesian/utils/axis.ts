import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

const X_LABEL_HEIGHT_RATIO_THRESHOLD = 0.7; // x-axis labels cannot be taller than 70% of chart height

const checkHeight = (
  maxXTickWidth: number,
  outerHeight: number,
  rotation: "rotate-90" | "rotate-45",
) => {
  if (rotation === "rotate-90") {
    return maxXTickWidth / outerHeight < X_LABEL_HEIGHT_RATIO_THRESHOLD;
  }
  return (
    maxXTickWidth / Math.SQRT2 / outerHeight < X_LABEL_HEIGHT_RATIO_THRESHOLD
  );
};

const X_LABEL_ROTATE_90_THRESHOLD = 2;
const X_LABEL_ROTATE_45_THRESHOLD = 15;

export const getAutoAxisEnabledSetting = (
  minXTickSpacing: number,
  maxXTickWidth: number,
  outerHeight: number,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings["graph.x_axis.axis_enabled"] => {
  const autoSelectSetting =
    settings["graph.x_axis.axis_enabled"] === true &&
    settings["graph.x_axis.scale"] === "ordinal";
  if (!autoSelectSetting) {
    return settings["graph.x_axis.axis_enabled"];
  }

  if (minXTickSpacing < X_LABEL_ROTATE_90_THRESHOLD) {
    return checkHeight(maxXTickWidth, outerHeight, "rotate-90")
      ? "rotate-90"
      : false;
  }
  if (minXTickSpacing < X_LABEL_ROTATE_45_THRESHOLD) {
    return checkHeight(maxXTickWidth, outerHeight, "rotate-45")
      ? "rotate-45"
      : false;
  }
  return true;
};
