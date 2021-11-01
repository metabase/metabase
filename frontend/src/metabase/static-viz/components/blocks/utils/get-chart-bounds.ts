import { Dimensions, Margins } from "../types";

export const getChartBounds = (dimensions: Dimensions, margins: Margins) => {
  const width = dimensions.width - margins.left - margins.right;
  const height = dimensions.height - margins.top - margins.bottom;

  return {
    width,
    height,
  };
};
