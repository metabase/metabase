import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { DATASET_DIMENSIONS } from "./constants";

export function buildEChartsWaterfallSeries(
  settings: ComputedVisualizationSettings,
): RegisteredSeriesOption["bar"][] {
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
      itemStyle: {
        color: settings["waterfall.increase_color"],
      },
    },
    {
      type: "bar",
      stack: "waterfall_stack",
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: DATASET_DIMENSIONS.decrease,
      },
      itemStyle: {
        color: settings["waterfall.decrease_color"],
      },
    },
    {
      type: "bar",
      stack: "waterfall_stack",
      encode: {
        x: DATASET_DIMENSIONS.dimension,
        y: DATASET_DIMENSIONS.total,
      },
      itemStyle: {
        color: settings["waterfall.total_color"],
      },
    },
  ];
}
