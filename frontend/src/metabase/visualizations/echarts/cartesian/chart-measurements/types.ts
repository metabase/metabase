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
  minXTickSpacing: number;
  outerHeight: number;
}
