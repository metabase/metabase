import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

export interface Padding {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface TicksDimensions {
  yTicksWidthLeft: number;
  yTicksWidthRight: number;
  xTicksHeight: number;
  firstXTickWidth: number;
  lastXTickWidth: number;
  maxXTickWidth: number;
  minXTickSpacing: number;
}

export interface ChartBoundsCoords {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ChartMeasurements {
  padding: Padding;
  ticksDimensions: TicksDimensions;
  bounds: ChartBoundsCoords;
  boundaryWidth: number;
  outerHeight: number;
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"];
}
