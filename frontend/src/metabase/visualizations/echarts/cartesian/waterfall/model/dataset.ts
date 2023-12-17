import type { RowValues } from "metabase-types/api";
import {
  assertMultiMetricColumns,
  type CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import { checkNumber } from "metabase/lib/types";

import type {
  WaterfallDataset,
  WaterfallDatum,
  WaterfallEmptyValue,
} from "../types";
import { DATASET_DIMENSIONS } from "../constants";

function createDatum({
  dimension,
  barOffset,
  increase,
  decrease,
  total,
}: {
  dimension: string;
  barOffset?: number;
  increase?: number | WaterfallEmptyValue;
  decrease?: number | WaterfallEmptyValue;
  total?: number;
}): WaterfallDatum {
  return {
    [DATASET_DIMENSIONS.dimension]: dimension,
    [DATASET_DIMENSIONS.barOffset]: barOffset ?? 0,
    [DATASET_DIMENSIONS.increase]: increase ?? "-",
    [DATASET_DIMENSIONS.decrease]: decrease ?? "-",
    [DATASET_DIMENSIONS.total]: total ?? "-",
  };
}

export function getWaterfallDataset(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
  negativeTranslation: number,
): WaterfallDataset {
  const columns = assertMultiMetricColumns(cardColumns);
  const dataset: WaterfallDataset = [];

  rows.forEach((row, index) => {
    const dimension = String(row[columns.dimension.index]);
    const value = checkNumber(row[columns.metrics[0].index]);

    let increase: number | "-" = "-";
    let decrease: number | "-" = "-";
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
      let barOffset = negativeTranslation;
      if (decrease !== "-") {
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

    let barOffset = 0;
    // case 1: increase following increase
    if (increase !== "-" && prevIncrease !== "-") {
      barOffset = prevBarOffset + prevIncrease;
    }
    // case 2: decrease following increase
    else if (decrease !== "-" && prevIncrease !== "-") {
      barOffset = prevBarOffset + prevIncrease - decrease;
    }
    // case 3: decrease following decrease
    else if (decrease !== "-" && prevDecrease !== "-") {
      barOffset = prevBarOffset - decrease;
    }
    // case 4: increase following decrease
    else if (increase !== "-" && prevDecrease !== "-") {
      barOffset = prevBarOffset;
    }

    dataset.push(createDatum({ dimension, barOffset, increase, decrease }));
  });

  // TODO total

  return dataset;
}
