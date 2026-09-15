import type { ValueAxisBaseOption } from "echarts/types/src/coord/axisCommonTypes";

import type { ComputedVisualizationSettings, Padding } from "../../../types";

export interface DashboardXAxis {
  options: Pick<
    ValueAxisBaseOption,
    "min" | "max" | "scale" | "containShape"
  > & {
    type: "value" | "time";
    axisLabel: NonNullable<ValueAxisBaseOption["axisLabel"]>;
  };
  step: number;
}

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
  xAxisMarkWidthRatio?: number;
  getXAxisMarkWidth?: (step: number) => number;
  dashboardXAxis?: DashboardXAxis;
}
