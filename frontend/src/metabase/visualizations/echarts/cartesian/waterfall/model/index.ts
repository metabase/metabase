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
import type { Extent } from "../../model/types";
import type {
  WaterfallChartModel,
  WaterfallDataset,
  WaterfallDatum,
} from "../types";
import { DATASET_DIMENSIONS } from "../constants";
import { getCardsColumns, getCartesianChartModel } from "../../model";

export function getWaterfallExtent(dataset: WaterfallDataset) {
  const extent: Extent = [0, 0];

  dataset.forEach(datum => {
    const barOffset = datum[DATASET_DIMENSIONS.barOffset];
    const increase = datum[DATASET_DIMENSIONS.increase];
    const decrease = datum[DATASET_DIMENSIONS.decrease];

    let value: number;
    if (increase !== null) {
      value = barOffset + increase;
    } else if (decrease !== null) {
      value = barOffset - decrease;
    } else {
      throw TypeError("Both increase and decrease cannot be null");
    }

    extent[0] = Math.min(extent[0], value);
    extent[1] = Math.max(extent[1], value);
  });

  return extent;
}

function createDatum({
  dimension,
  barOffset,
  increase,
  decrease,
  total,
}: {
  dimension: string;
  barOffset?: number | null;
  increase?: number | null;
  decrease?: number | null;
  total?: number;
}): WaterfallDatum {
  return {
    [DATASET_DIMENSIONS.dimension]: dimension,
    [DATASET_DIMENSIONS.barOffset]: barOffset ?? 0,
    [DATASET_DIMENSIONS.increase]: increase ?? null,
    [DATASET_DIMENSIONS.decrease]: decrease ?? null,
    [DATASET_DIMENSIONS.total]: total ?? null,
  };
}

export function getWaterfallTranslationConstant(
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

export function getWaterfallDataset(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
  translationConstant: number,
): WaterfallDataset {
  const columns = assertMultiMetricColumns(cardColumns);
  const dataset: WaterfallDataset = [];

  rows.forEach((row, index) => {
    const dimension = String(row[columns.dimension.index]);
    const value = checkNumber(row[columns.metrics[0].index]);

    let increase: number | null = null;
    let decrease: number | null = null;
    if (value >= 0) {
      increase = value;
    } else {
      decrease = -value;
    }

    // Since echarts always stacks from below, we translate the first bar
    // to ensure that the `barOffset` will keep each bar stack above 0 on
    // the chart. Later when formatting the y-axis ticks we will account
    // for this offset to make the ticks display the correct values from
    // the underlying data.
    if (index === 0) {
      let barOffset = translationConstant;
      if (decrease !== null) {
        barOffset -= decrease;
      }

      dataset.push(createDatum({ barOffset, dimension, increase, decrease }));
      return;
    }

    const {
      barOffset: prevBarOffset,
      increase: prevIncrease,
      decrease: prevDecrease,
    } = dataset[dataset.length - 1];

    let barOffset: number | null = null;
    // case 1: increase following increase
    if (increase !== null && prevIncrease !== null) {
      barOffset = prevBarOffset + prevIncrease;
    }
    // case 2: decrease following increase
    else if (decrease !== null && prevIncrease !== null) {
      barOffset = prevBarOffset + prevIncrease - decrease;
    }
    // case 3: decrease following decrease
    else if (decrease !== null && prevDecrease !== null) {
      barOffset = prevBarOffset - decrease;
    }
    // case 4: increase following decrease
    else if (increase !== null && prevDecrease !== null) {
      barOffset = prevBarOffset;
    }

    dataset.push(createDatum({ dimension, barOffset, increase, decrease }));
  });

  // TODO total

  return dataset;
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

  const cardsColumns = getCardsColumns(rawSeries, settings);
  const translationConstant = getWaterfallTranslationConstant(
    rawSeries[0].data.rows,
    cardsColumns[0],
  );
  const dataset = getWaterfallDataset(
    rawSeries[0].data.rows,
    cardsColumns[0],
    translationConstant,
  );

  const waterfallChartModel: WaterfallChartModel = {
    ...baseChartModel,
    dataset,
    translationConstant,
  };
  return waterfallChartModel;
}
