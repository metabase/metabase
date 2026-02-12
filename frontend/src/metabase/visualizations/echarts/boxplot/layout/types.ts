import type { ChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements/types";
import type { DataKey } from "metabase/visualizations/echarts/cartesian/model/types";

import type { LabelLayoutMode } from "../utils";

export type BoxPlotLabelOverflow = {
  top: number;
  bottom: number;
};

export type BoxPlotSideLabelOverflow = {
  left: number;
  right: number;
  leftYAxisOffset: number;
  rightYAxisOffset: number;
};

export type BoxPlotPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type BoxPlotLayoutModel = {
  // Number of unique x-axis values
  xValuesCount: number;

  // Width in pixels allocated for each x-value on x-axis
  xValueWidth: number;

  // Width allocated per series within an x-value (xValueWidth / visibleSeriesCount)
  subcategoryWidth: number;

  // Pixel offsets from category center for each visible series, keyed by dataKey.
  // Use as: visibleSeriesOffsets.get(seriesModel.dataKey)
  visibleSeriesOffsets: Map<DataKey, number>;

  // Whether labels appear on sides of boxes ("side") or above/below ("vertical")
  labelLayoutMode: LabelLayoutMode;

  // Box dimensions
  boxWidth: number;
  boxHalfWidth: number;

  // Symbol sizes for scatter points (outliers, data points, mean)
  symbolSize: number;
  meanSymbolSize: number;

  // Horizontal distance from box edge to label position
  labelOffset: number;

  // Extra padding needed to prevent label clipping
  labelOverflow: BoxPlotLabelOverflow;
  sideLabelOverflow: BoxPlotSideLabelOverflow;

  // Final padding including label overflow adjustments
  adjustedPadding: BoxPlotPadding;

  // Vertical offset for x-axis to accommodate bottom labels
  xAxisOffset: number;

  // Original chart measurements from cartesian chart system
  chartMeasurements: ChartMeasurements;
};
