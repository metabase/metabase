import { Dimensions, Margin } from "../components/types";

export const getChartBounds = (dimensions: Dimensions, margins: Margin) => {
  const width = dimensions.width - margins.left - margins.right;
  const height = dimensions.height - margins.top - margins.bottom;

  return {
    width,
    height,
  };
};
