import type { RowValue } from "metabase-types/api";

import { X_AXIS_DATA_KEY, X_AXIS_POSITION_KEY } from "../constants/dataset";

import type { CategoryXAxisPositions, ChartDataset, XAxisModel } from "./types";

export function getXAxisPositions(
  dataset: ChartDataset,
  axisModel: XAxisModel,
): CategoryXAxisPositions | undefined {
  if (axisModel.axisType !== "category" || !axisModel.isDashboard) {
    return;
  }

  const values: RowValue[] = [];
  const indexByValue = new Map<RowValue, number>();

  for (const datum of dataset) {
    const value = datum[X_AXIS_DATA_KEY];
    if (!indexByValue.has(value)) {
      indexByValue.set(value, values.length);
      values.push(value);
    }
  }

  if (values.length < 2) {
    return;
  }

  return { values, indexByValue };
}

export function appendXAxisPositions(
  dataset: ChartDataset,
  positions: CategoryXAxisPositions | undefined,
): ChartDataset {
  if (!positions) {
    return dataset;
  }

  return dataset.map((datum) => ({
    ...datum,
    [X_AXIS_POSITION_KEY]:
      positions.indexByValue.get(datum[X_AXIS_DATA_KEY]) ?? null,
  }));
}
