import type { ComputedVisualizationSettings, Padding } from "../../../types";

export interface TicksDimensions {
  yTicksWidthLeft: number;
  yTicksWidthRight: number;
  xTicksHeight: number;
  xTickWidthCap: number;
  firstXTickWidth: number;
  lastXTickWidth: number;
  getXTickWidth: (text: string) => number;
}

export interface ChartBoundsCoords {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type TicksRotation = "horizontal" | "vertical";

export interface RowChartMetricTicks {
  interval: number;
  min?: number;
  max?: number;
  showMinLabel: boolean;
  showMaxLabel: boolean;
}

export interface ChartLayout {
  /**
   * Row charts put the dimension on the vertical axis and the metrics on the
   * horizontal one — the reverse of every other cartesian chart. `ChartLayout`
   * carries the flag because it already reaches every axis, series and grid
   * builder, so nothing else needs a new parameter.
   */
  isRowChart: boolean;
  /** Row charts only: legacy-matched ticks for the horizontal metric axis. */
  metricTicks?: RowChartMetricTicks;
  padding: Padding;
  ticksDimensions: TicksDimensions;
  bounds: ChartBoundsCoords;
  boundaryWidth: number;
  outerHeight: number;
  outerWidth: number;
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"];
  stackedBarTicksRotation?: TicksRotation;
  panelHeight?: number;
  panelGap: number;
}
