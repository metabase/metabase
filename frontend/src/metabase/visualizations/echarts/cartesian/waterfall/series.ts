import type {
  CallbackDataParams,
  RegisteredSeriesOption,
} from "echarts/types/dist/shared";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { SeriesModel } from "../model/types";
import {
  buildEChartsLabelOptions,
  getDataLabelFormatter,
} from "../option/series";
import { DATASET_DIMENSIONS } from "./constants";

export function buildEChartsWaterfallSeries(
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  total: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"][] {
  // formatters
  const baseDataLabelFormatter = getDataLabelFormatter(
    seriesModel,
    settings,
    renderingContext,
  );
  const negativeDataLabelFormatter = (datum: CallbackDataParams) =>
    `(${baseDataLabelFormatter(datum)})`;

  // options
  const increaseLabelOptions = buildEChartsLabelOptions(
    seriesModel,
    settings,
    renderingContext,
  );
  const decreaseLabelOptions = {
    ...increaseLabelOptions,
    position: "bottom" as const,
    formatter: negativeDataLabelFormatter,
  };
  const totalLabelOptions = {
    ...increaseLabelOptions,
    position: total >= 0 ? ("top" as const) : ("bottom" as const),
    formatter: total >= 0 ? baseDataLabelFormatter : negativeDataLabelFormatter,
  };

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
        y: DATASET_DIMENSIONS.barOffset,
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
      label: increaseLabelOptions,
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
      label: decreaseLabelOptions,
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
      label: totalLabelOptions,
    },
  ];
}
