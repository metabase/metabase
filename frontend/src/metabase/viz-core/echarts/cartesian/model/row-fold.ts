import { t } from "ttag";

import { checkNumber } from "metabase/utils/types";

import type { ComputedVisualizationSettings } from "../../../types";
import { IS_FOLDED_ROW_DATA_KEY, X_AXIS_DATA_KEY } from "../constants/dataset";

import { getYAxisExtent } from "./axis";
import { applyVisualizationSettingsDataTransformations } from "./dataset";
import type { CartesianChartModel, ChartDataset, Datum } from "./types";

// Rows that don't fit fold into one summed "Other" row. One rule for app and
// email: each band (per series, or one when stacked) needs MIN_BAR_HEIGHT.
export const MIN_BAR_HEIGHT = 24;

const getRowChartBudget = (chartHeight: number, bandCount: number): number =>
  Math.max(Math.floor(chartHeight / (MIN_BAR_HEIGHT * bandCount)), 1);

const sumInto = (target: Datum, source: Datum, keys: string[]) => {
  keys.forEach((key) => {
    const value = source[key];
    if (value == null) {
      return;
    }
    const current = target[key];
    target[key] =
      (current == null ? 0 : checkNumber(current)) + checkNumber(value);
  });
};

const foldDataset = (
  dataset: ChartDataset,
  budget: number,
  seriesKeys: string[],
): ChartDataset => {
  const kept = dataset.slice(0, budget - 1);
  const folded = dataset.slice(budget - 1);

  const label =
    kept.length === 0
      ? t`All values (${folded.length})`
      : t`Other (${folded.length})`;

  const total: Datum = {
    [X_AXIS_DATA_KEY]: label,
    [IS_FOLDED_ROW_DATA_KEY]: true,
  };
  folded.forEach((datum) => sumInto(total, datum, seriesKeys));

  return [...kept, total];
};

export const foldRowChartModel = (
  chartModel: CartesianChartModel,
  chartHeight: number,
  settings: ComputedVisualizationSettings,
): CartesianChartModel => {
  const visibleSeries = chartModel.seriesModels.filter(
    (series) => series.visible,
  );
  if (visibleSeries.length === 0 || chartHeight <= 0) {
    return chartModel;
  }

  const isStacked = chartModel.stackModels.length > 0;
  const bandCount = isStacked ? 1 : visibleSeries.length;
  const budget = getRowChartBudget(chartHeight, bandCount);

  if (chartModel.dataset.length <= budget) {
    return chartModel;
  }

  // Fold the untransformed values, then re-run the chart's own transforms, so
  // "Other" is normalized and scaled like every other row.
  // Grouped series too, so the re-run transforms can total the "Other" series.
  const seriesKeys = [
    ...chartModel.seriesModels,
    ...(chartModel.groupedSeriesModels ?? []),
  ].map((series) => series.dataKey);
  const dataset = foldDataset(chartModel.dataset, budget, seriesKeys);
  const transformedDataset = applyVisualizationSettingsDataTransformations(
    dataset,
    chartModel.stackModels,
    chartModel.xAxisModel,
    chartModel.seriesModels,
    chartModel.groupedSeriesModels ?? [],
    chartModel.yAxisScaleTransforms,
    settings,
  );

  return {
    ...chartModel,
    dataset,
    transformedDataset,
    // "Other" can exceed every row's range; row charts only have a left axis.
    leftAxisModel: chartModel.leftAxisModel && {
      ...chartModel.leftAxisModel,
      extent: getYAxisExtent(
        chartModel.leftAxisModel.seriesKeys,
        chartModel.stackModels,
        transformedDataset,
        settings["stackable.stack_type"],
      ),
    },
  };
};
