import type { CartesianChartModel } from "../model/types";
import type { WaterfallChartModel } from "./types";

function isWaterfallChartModel(
  chartModel: CartesianChartModel | WaterfallChartModel,
): chartModel is WaterfallChartModel {
  if (
    (chartModel as WaterfallChartModel).waterfallDataset == null ||
    (chartModel as WaterfallChartModel).total == null ||
    (chartModel as WaterfallChartModel).negativeTranslation == null
  ) {
    return false;
  }

  return true;
}

export function checkWaterfallChartModel(
  chartModel: CartesianChartModel | WaterfallChartModel,
) {
  if (!isWaterfallChartModel(chartModel)) {
    throw Error("chartModel is not a WaterfallChartModel");
  }
  return chartModel;
}
