import { t } from "ttag";

import { checkNumber } from "metabase/utils/types";

import type { ComputedVisualizationSettings } from "../../../types";
import {
  INDEX_KEY,
  IS_FOLDED_ROW_DATA_KEY,
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "../constants/dataset";

import { refitYAxisExtents } from "./axis";
import type { CartesianChartModel, ChartDataset, Datum } from "./types";
import { getBarSeriesDataLabelKey } from "./util";

// Rows that don't fit fold into one summed "Other" row. One rule for app and
// email: each band (per series, or one when stacked) needs MIN_BAR_HEIGHT.
export const MIN_BAR_HEIGHT = 24;

export const getRowChartBudget = (
  plotHeight: number,
  bandCount: number,
): number => Math.max(Math.floor(plotHeight / (MIN_BAR_HEIGHT * bandCount)), 1);

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

// Label series draw only where the dataset transforms left sign markers; set
// them from the summed values, since folded rows can mix signs.
const markLabelSigns = (
  total: Datum,
  seriesKeys: string[],
  isStacked: boolean,
) => {
  seriesKeys.forEach((key) => {
    const value = total[key];
    if (typeof value !== "number") {
      return;
    }
    const isPositive = value >= 0;
    const marker = isPositive ? Number.MIN_VALUE : -Number.MIN_VALUE;
    total[getBarSeriesDataLabelKey(key, isPositive ? "+" : "-")] = marker;
    if (isStacked) {
      total[
        isPositive
          ? POSITIVE_STACK_TOTAL_DATA_KEY
          : NEGATIVE_STACK_TOTAL_DATA_KEY
      ] = marker;
    }
  });
};

const foldDataset = (
  dataset: ChartDataset,
  budget: number,
  seriesKeys: string[],
  // Set when folding `transformedDataset`, whose rows carry extra keys.
  transformed?: { isStacked: boolean },
): ChartDataset => {
  if (dataset.length <= budget) {
    return dataset;
  }

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
  if (transformed) {
    markLabelSigns(total, seriesKeys, transformed.isStacked);
    // Events map transformed rows back to `dataset` by this index.
    total[INDEX_KEY] = kept.length;
  }

  return [...kept, total];
};

export const foldRowChartModel = (
  chartModel: CartesianChartModel,
  plotHeight: number,
  settings: ComputedVisualizationSettings,
): CartesianChartModel => {
  const visibleSeries = chartModel.seriesModels.filter(
    (series) => series.visible,
  );
  if (visibleSeries.length === 0 || plotHeight <= 0) {
    return chartModel;
  }

  const isStacked = settings["stackable.stack_type"] != null;
  const bandCount = isStacked ? 1 : visibleSeries.length;
  const budget = getRowChartBudget(plotHeight, bandCount);

  if (chartModel.transformedDataset.length <= budget) {
    return chartModel;
  }

  const seriesKeys = chartModel.seriesModels.map((series) => series.dataKey);
  const transformedDataset = foldDataset(
    chartModel.transformedDataset,
    budget,
    seriesKeys,
    { isStacked: settings["stackable.stack_type"] === "stacked" },
  );

  return {
    ...chartModel,
    dataset: foldDataset(chartModel.dataset, budget, seriesKeys),
    transformedDataset,
    ...refitYAxisExtents(chartModel, transformedDataset, settings),
  };
};
