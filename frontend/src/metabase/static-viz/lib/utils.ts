export const STATIC_CARTESIAN_CHART_SIZE = {
  width: 540,
  height: 360,
} as const;

export const getChartHeight = ({
  fitWithinBounds,
  height,
  legendHeight,
}: {
  fitWithinBounds: boolean;
  height: number;
  legendHeight: number;
}) => (fitWithinBounds ? Math.max(height - legendHeight, 1) : height);
