export const STATIC_CARTESIAN_CHART_SIZE = {
  width: 540,
  height: 360,
} as const;

// Row charts keep the size the legacy static row chart (v64 or earlier) was drawn at.
export const STATIC_ROW_CHART_SIZE = {
  width: 620,
  height: 440,
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
