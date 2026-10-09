export type ChartFont = {
  size: number;
  family: string;
  weight: number;
  color: string;
};

export type GoalMarkerStyle = {
  iconColor: string;
  backgroundColor: string;
  hoverBackgroundColor: string;
  shadowColor: string;
};

export type GoalStyle = {
  lineStroke: string;
  lineShadowStroke: string;
  label: ChartFont;
  marker: GoalMarkerStyle;
};

export type AxisStyle = {
  color: string;
  ticks: ChartFont;
  label: ChartFont;
};
