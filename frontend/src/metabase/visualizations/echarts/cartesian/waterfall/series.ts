import type {
  CallbackDataParams,
  RegisteredSeriesOption,
} from "echarts/types/dist/shared";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { checkNumber } from "metabase/lib/types";
import type { GroupedDataset, SeriesModel } from "../model/types";
import { buildEChartsLabelOptions } from "../option/series";
import { DATASET_DIMENSIONS } from "./constants";

/**
 * Returns formatting functions for the series and total data
 * labels for the waterfall chart. We provide the `dataset`
 * parameter in order to use the actual data value, rather than the
 * value of the bar rendered by echarts, because in the power
 * scale the bar has a different value from the underlying datum.
 */
export function getWaterfallLabelFormatters(
  total: number,
  seriesModel: SeriesModel,
  dataset: GroupedDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  const valueFormatter = (value: unknown) => {
    const formattedValue = renderingContext.formatValue(
      Math.abs(checkNumber(value)),
      {
        ...(settings.column?.(seriesModel.column) ?? {}),
        jsx: false,
        compact: settings["graph.label_value_formatting"] === "compact",
      },
    );
    if (typeof value === "number" && value < 0) {
      return `(${formattedValue})`;
    }
    return formattedValue;
  };

  const seriesLabelFormatter = (datum: CallbackDataParams) =>
    valueFormatter(dataset[datum.dataIndex][seriesModel.dataKey]);

  const totalLabelFormatter = () => valueFormatter(total);

  return { seriesLabelFormatter, totalLabelFormatter };
}

export function buildEChartsWaterfallSeries(
  seriesModel: SeriesModel,
  dataset: GroupedDataset,
  settings: ComputedVisualizationSettings,
  total: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"][] {
  const { seriesLabelFormatter, totalLabelFormatter } =
    getWaterfallLabelFormatters(
      total,
      seriesModel,
      dataset,
      settings,
      renderingContext,
    );

  const baseLabelOptions = buildEChartsLabelOptions(
    seriesModel,
    settings,
    renderingContext,
  );
  const increaseLabelOptions = {
    ...baseLabelOptions,
    position: "top" as const,
    formatter: seriesLabelFormatter,
  };
  const decreaseLabelOptions = {
    ...baseLabelOptions,
    position: "bottom" as const,
    formatter: seriesLabelFormatter,
  };
  const totalLabelOptions = {
    ...baseLabelOptions,
    position: total >= 0 ? ("top" as const) : ("bottom" as const),
    formatter: totalLabelFormatter,
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
