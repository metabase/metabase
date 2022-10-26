export type LegendItem = {
  name: string;
  color: string;
};

export type PositionedLegendItem = LegendItem & {
  left: number;
  top: number;
};
