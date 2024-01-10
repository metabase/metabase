import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import { DATASET_DIMENSIONS } from "./constants";

export function buildEChartsWaterfallSeries(): RegisteredSeriesOption["bar"][] {
  return [
    {
      type: "bar",
      stack: "waterfall_stack",
      silent: true,
      itemStyle: {
        borderColor: "transparent",
        color: "transparent",
      },
      emphasis: {
        itemStyle: {
          borderColor: "transparent",
          color: "transparent",
        },
      },
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: "barOffset",
      },
    },
    {
      type: "bar",
      stack: "waterfall_stack",
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: DATASET_DIMENSIONS.increase,
      },
    },
    {
      type: "bar",
      stack: "waterfall_stack",
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: DATASET_DIMENSIONS.decrease,
      },
    },
    {
      type: "bar",
      stack: "waterfall_stack",
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: DATASET_DIMENSIONS.total,
      },
    },
  ];
}
