import dayjs from "dayjs";

import type { RawSeries, RowValue, RowValues } from "metabase-types/api";
import { checkNotNull, checkNumber } from "metabase/lib/types";
import {
  assertMultiMetricColumns,
  type CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { Extent } from "../../model/types";
import { getCardsColumns, getCartesianChartModel } from "../../model";
import type { WaterfallChartModel, WaterfallDataset } from "../types";
import { DATASET_DIMENSIONS } from "../constants";

import { getWaterfallDataset } from "./dataset";

export function getWaterfallExtent(dataset: WaterfallDataset) {
  const extent: Extent = [0, 0];

  dataset.forEach(datum => {
    const barOffset = datum[DATASET_DIMENSIONS.barOffset];
    const increase = datum[DATASET_DIMENSIONS.increase];
    const decrease = datum[DATASET_DIMENSIONS.decrease];
    const total = datum[DATASET_DIMENSIONS.total];

    let value: number;
    if (increase !== "-") {
      value = barOffset + increase;
    } else if (decrease !== "-") {
      value = barOffset - decrease;
    } else if (total !== "-") {
      return;
    } else {
      throw TypeError("Increase, decrease, and total cannot all be empty");
    }

    extent[0] = Math.min(extent[0], value);
    extent[1] = Math.max(extent[1], value);
  });

  return extent;
}

function getSortedAggregatedRows(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
  settings: ComputedVisualizationSettings,
) {
  if (settings["graph.x_axis.scale"] === "timeseries") {
    rows.sort((left, right) => {
      const leftValue = left[cardColumns.dimension.index];
      const rightValue = right[cardColumns.dimension.index];

      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return dayjs(leftValue).valueOf() - dayjs(rightValue).valueOf();
      }

      return 0;
    });
  }

  // aggregate metric values by dimension into a map
  const columns = assertMultiMetricColumns(cardColumns);
  const dimensionMetricMap = new Map<RowValue, number>();

  rows.forEach(row => {
    const dimension = row[columns.dimension.index];
    const currMetric = checkNumber(row[columns.metrics[0].index]);
    const existingMetric = dimensionMetricMap.get(dimension);

    const newMetric = currMetric + (existingMetric ?? 0);
    dimensionMetricMap.set(dimension, newMetric);
  });

  // create aggregated rows using the map
  const seenDimensions = new Set();
  const aggregatedRows: RowValues[] = [];

  rows.forEach(row => {
    const dimension = row[columns.dimension.index];
    if (seenDimensions.has(dimension)) {
      return;
    }

    const metric = checkNotNull(dimensionMetricMap.get(dimension));
    const newRow = [...row];
    newRow[columns.metrics[0].index] = metric;

    aggregatedRows.push(newRow);
    seenDimensions.add(dimension);
  });

  return aggregatedRows;
}

function getWaterfallNegativeTranslation(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
) {
  const columns = assertMultiMetricColumns(cardColumns);

  const runningSums: number[] = [];
  rows.forEach((row, index) => {
    const value = checkNumber(row[columns.metrics[0].index]);

    if (index === 0) {
      runningSums.push(value);
      return;
    }

    runningSums.push(runningSums[runningSums.length - 1] + value);
  });

  const minSum = Math.min(...runningSums);
  return minSum < 0 ? -minSum : 0;
}

function getWaterfallTotal(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
) {
  const columns = assertMultiMetricColumns(cardColumns);

  return rows.reduce(
    (sum, row) => (sum += checkNumber(row[columns.metrics[0].index])),
    0,
  );
}

export function getWaterfallChartModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  const baseChartModel = getCartesianChartModel(
    rawSeries,
    settings,
    renderingContext,
  );

  // dataset
  const cardColumns = getCardsColumns(rawSeries, settings)[0];
  const rows = getSortedAggregatedRows(
    rawSeries[0].data.rows,
    cardColumns,
    settings,
  );
  const negativeTranslation = getWaterfallNegativeTranslation(
    rows,
    cardColumns,
  );
  const total = getWaterfallTotal(rows, cardColumns);
  const waterfallDataset = getWaterfallDataset(
    rows,
    cardColumns,
    negativeTranslation,
    total,
    settings,
  );

  // y-axis
  const yAxisExtents: AxisExtents = [
    getWaterfallExtent(waterfallDataset),
    null,
  ];

  const waterfallChartModel: WaterfallChartModel = {
    ...baseChartModel,
    waterfallDataset,
    negativeTranslation,
    total,
    yAxisExtents,
  };
  return waterfallChartModel;
}
