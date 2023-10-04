import type { Margin } from "metabase/visualizations/shared/types/layout";

export const calculateBounds = (
  margin: Margin,
  width: number,
  height: number,
) => {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xMin = margin.left;
  const xMax = xMin + innerWidth;
  const yMax = margin.top;
  const yMin = yMax + innerHeight;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    innerHeight,
    innerWidth,
  };
};
