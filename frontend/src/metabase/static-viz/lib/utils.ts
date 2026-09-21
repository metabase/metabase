export const getChartHeight = ({
  fitWithinBounds,
  height,
  legendHeight,
}: {
  fitWithinBounds: boolean;
  height: number;
  legendHeight: number;
}) => (fitWithinBounds ? Math.max(height - legendHeight, 1) : height);
