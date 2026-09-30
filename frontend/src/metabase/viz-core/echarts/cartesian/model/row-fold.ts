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

/**
 * Row charts fold the rows that will not fit into a single summed "Other" bar.
 *
 * **The rule, stated once.** A row needs at least `MIN_BAR_HEIGHT` pixels; a
 * grouped breakout needs that much per series, while a stacked one shares a
 * single band. So:
 *
 *     budget = max(floor(plotHeight / (MIN_BAR_HEIGHT * bandCount)), 1)
 *
 * Writing it down matters because the two legacy renderers disagreed: the
 * interactive chart passed the height measured by `ExplicitSize` (net of legend
 * and title chrome) while the static one passed whatever it was handed, so the
 * same data folded differently in the app and in a subscription email. Both now
 * call this with the height available to the plot.
 *
 * The fold keeps `rows`, which lets a tooltip or drill reach what was folded
 * away rather than treating the bar as opaque (UXW-1447).
 */
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

/**
 * The dataset transforms flag each transformed row with sign markers that the
 * data-label and stack-total series draw from. A summed row needs its own,
 * taken from the summed values since the folded rows' signs can differ.
 */
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
    // Events map a transformed row back to `dataset` through this index; both
    // datasets fold at the same position, so Other sits at the same one.
    total[INDEX_KEY] = kept.length;
  }

  return [...kept, total];
};

/**
 * Apply the fold to every dataset the chart model exposes, so the axis, the
 * series and the labels all agree on which rows exist.
 */
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
