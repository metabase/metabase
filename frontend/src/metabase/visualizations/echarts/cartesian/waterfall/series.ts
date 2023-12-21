import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { SeriesModel } from "../model/types";
import { buildEChartsLabelOptions } from "../option/series";
import { DATASET_DIMENSIONS } from "./constants";

export function buildEChartsWaterfallSeries(
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"][] {
  const labelOptions = buildEChartsLabelOptions(
    seriesModel,
    settings,
    renderingContext,
  );

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
      label: labelOptions,
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
      label: labelOptions,
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
      label: labelOptions,
    },
  ];
}
