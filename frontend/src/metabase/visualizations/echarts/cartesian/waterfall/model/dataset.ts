import dayjs from "dayjs";
import type { RowValues } from "metabase-types/api";
import {
  assertMultiMetricColumns,
  type CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import { checkNumber } from "metabase/lib/types";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { WaterfallDataset } from "../types";

export function getWaterfallDataset(
  rows: RowValues[],
  cardColumns: CartesianChartColumns,
  settings: ComputedVisualizationSettings,
) {
  const columns = assertMultiMetricColumns(cardColumns);
  const dataset: WaterfallDataset = [];

  // Step 1: calculate runningSums, negativeTranslation beforehand
  let runningSums: number[] = [];
  rows.forEach((row, index) => {
    const value = checkNumber(row[columns.metrics[0].index]);

    if (index === 0) {
      runningSums.push(value);
      return;
    }

    runningSums.push(runningSums[runningSums.length - 1] + value);
  });

  if (settings["graph.y_axis.scale"] === "pow") {
    runningSums = runningSums.map(sum => {
      if (sum >= 0) {
        return Math.sqrt(sum);
      }
      return -Math.sqrt(-sum);
    });
  }

  const minSum = Math.min(...runningSums);
  const negativeTranslation = minSum >= 0 ? 0 : -minSum;

  // Step 2: create the waterfall dataset using the previously computed values
  for (let i = 0; i < runningSums.length; i++) {
    const dimension = String(rows[i][columns.dimension.index]);

    let barOffset = negativeTranslation;
    let increase: number | "-" = "-";
    let decrease: number | "-" = "-";

    const prevSum = i !== 0 ? runningSums[i - 1] : 0;
    const currSum = runningSums[i];

    if (currSum >= prevSum) {
      barOffset += prevSum;
      increase = currSum - prevSum;
    } else {
      barOffset += currSum;
      decrease = Math.abs(prevSum - currSum);
    }

    dataset.push({ dimension, barOffset, increase, decrease, total: "-" });
  }

  if (!settings["waterfall.show_total"]) {
    return { dataset, negativeTranslation };
  }

  // Step 3 (optional): datum for "Show total" setting
  const total = runningSums[runningSums.length - 1];
  const barOffset =
    total >= 0 ? negativeTranslation : negativeTranslation + total;

  let dimension = "Total";
  // For timeseries x-axis ECharts will not allow mixed values,
  // so we cannot set the dimension value to "Total." As a workaround,
  // we instead set it to be a date after the final date in the dataset,
  // then in the x-axis label formatter we will replace the label with the
  // string "Total."
  if (settings["graph.x_axis.scale"] === "timeseries") {
    const lastDimensionValue = rows[rows.length - 1][columns.dimension.index];
    if (typeof lastDimensionValue === "boolean") {
      throw Error(
        "dimension value cannot be boolean with timeseries x-axis scale",
      );
    }

    const lastDate = dayjs(lastDimensionValue);
    dimension = lastDate.add(1, "day").toISOString();
  }

  dataset.push({
    dimension,
    barOffset,
    increase: "-",
    decrease: "-",
    total: Math.abs(total),
  });

  return { dataset, negativeTranslation };
}
