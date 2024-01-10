import type { RowValues } from "metabase-types/api";
import { checkNumber } from "metabase/lib/types";
import {
  assertMultiMetricColumns,
  type CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";

import type { WaterfallDatum } from "./types";
import { DATASET_DIMENSIONS } from "./constants";

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

export function getWaterfallDataset(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
): WaterfallDatum[] {
  const columns = assertMultiMetricColumns(cardColumns);
  const dataset: WaterfallDatum[] = [];

  rows.forEach((row, index) => {
    const dimension = String(row[columns.dimension.index]);
    const value = checkNumber(row[columns.metrics[0].index]);

    let increase: number | null = null;
    let decrease: number | null = null;
    if (value >= 0) {
      increase = value;
    } else {
      decrease = value;
    }

    if (index === 0) {
      dataset.push(createDatum({ dimension, increase, decrease }));
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

  // TODO handle negatives
  // TODO total

  return dataset;
}
