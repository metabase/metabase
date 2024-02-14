import { X_AXIS_DATA_KEY } from "../constants/dataset";
import type { CartesianChartModel } from "../model/types";

export function getChartSidePadding(
  chartModel: CartesianChartModel,
  chartWidth: number,
  firstDimensionLabel: string,
  firstDimensionLabelDataIndex: number,
  lastDimensionLabel: string,
  lastDimensionLabelDataIndex: number,
) {
  debugger;
  const [minExtent, maxExtent] = chartModel.xAxisModel.extent; // TODO handle categorical axis differently
  const dataRange = maxExtent - minExtent;

  const maxExtentDimensionValue = chartModel.dataset[
    chartModel.dataset.length - 1
  ][X_AXIS_DATA_KEY] as number; // todo fix type cast
  const lastDimensionLabelValue = chartModel.dataset[
    lastDimensionLabelDataIndex
  ][X_AXIS_DATA_KEY] as number; // todo fix type cast

  // TODO calculate this with just indicies instead of data values, would use index range (e.g. array length) instead of dataRange
  const lastLabelDatumDistanceToBoundary =
    (maxExtentDimensionValue - lastDimensionLabelValue) *
    (dataRange / chartWidth);
}
