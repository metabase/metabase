import dayjs from "dayjs";

import type { RawSeries, RowValues } from "metabase-types/api";
import { checkNumber } from "metabase/lib/types";
import {
  assertMultiMetricColumns,
  type CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { AxisExtents, Extent } from "../../model/types";
import { getCardsColumns, getCartesianChartModel } from "../../model";
import type { WaterfallChartModel, WaterfallDataset } from "../types";
import { DATASET_DIMENSIONS } from "../constants";

import { getWaterfallDataset } from "./dataset";

function getWaterfallExtent(dataset: WaterfallDataset) {
  const extent: Extent = [0, 0];

  dataset.forEach(datum => {
    const barOffset = datum[DATASET_DIMENSIONS.barOffset];
    const increase = datum[DATASET_DIMENSIONS.increase];
    const decrease = datum[DATASET_DIMENSIONS.decrease];

    let value: number;
    if (increase !== "-") {
      value = barOffset + increase;
    } else if (decrease !== "-") {
      value = barOffset - decrease;
    } else {
      throw TypeError("Both increase and decrease cannot be null");
    }

    extent[0] = Math.min(extent[0], value);
    extent[1] = Math.max(extent[1], value);
  });

  return extent;
}

function getSortedRows(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
  settings: ComputedVisualizationSettings,
) {
  if (settings["graph.x_axis.scale"] !== "timeseries") {
    return rows;
  }

  return rows.sort((left, right) => {
    const leftValue = left[cardColumns.dimension.index];
    const rightValue = right[cardColumns.dimension.index];

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return dayjs(leftValue).valueOf() - dayjs(rightValue).valueOf();
    }

    return 0;
  });
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
  const rows = getSortedRows(rawSeries[0].data.rows, cardColumns, settings);
  const negativeTranslation = getWaterfallNegativeTranslation(
    rows,
    cardColumns,
  );
  const waterfallDataset = getWaterfallDataset(
    rows,
    cardColumns,
    negativeTranslation,
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
    yAxisExtents,
  };
  return waterfallChartModel;
}
