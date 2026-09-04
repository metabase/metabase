export type ChartFont = {
  size: number;
  family: string;
  weight: number;
  color: string;
};

export type GoalStyle = {
  lineStroke: string;
  label: ChartFont;
};

export type AxisStyle = {
  color: string;
  ticks: ChartFont;
  label: ChartFont;
};
