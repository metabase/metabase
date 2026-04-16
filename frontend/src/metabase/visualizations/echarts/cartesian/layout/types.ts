import type {
  ComputedVisualizationSettings,
  Padding,
} from "metabase/visualizations/types";

export interface TicksDimensions {
  yTicksWidthLeft: number;
  yTicksWidthRight: number;
  xTicksHeight: number;
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

export interface ChartLayout {
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
