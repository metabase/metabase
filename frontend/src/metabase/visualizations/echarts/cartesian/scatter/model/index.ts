import { getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import type { ShowWarning } from "metabase/visualizations/echarts/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getCardsColumns } from "../../model";
import { getXAxisModel, getYAxesModels } from "../../model/axis";
import {
  applyVisualizationSettingsDataTransformations,
  getCardsColumnByDataKeyMap,
  getDatasetExtents,
  getSortedSeriesModels,
  scaleDataset,
  sortDataset,
} from "../../model/dataset";
import { getCardsSeriesModels, getDimensionModel } from "../../model/series";
import { getAxisTransforms } from "../../model/transforms";
import { getTrendLines } from "../../model/trend-line";
import type {
  ChartDataset,
  Extent,
  ScatterPlotModel,
  SeriesModel,
} from "../../model/types";

import { getScatterPlotDataset } from "./dataset";

const getBubbleSizeDomain = (
  seriesModels: SeriesModel[],
  dataset: ChartDataset,
): Extent | null => {
  const bubbleSizeDataKeys = seriesModels
    .map(seriesModel =>
      "bubbleSizeDataKey" in seriesModel &&
      seriesModel.bubbleSizeDataKey != null
        ? seriesModel.bubbleSizeDataKey
        : null,
    )
    .filter(isNotNull);

  if (bubbleSizeDataKeys.length === 0) {
    return null;
  }

  const bubbleSizeMaxValues = getObjectValues(
    getDatasetExtents(bubbleSizeDataKeys, dataset),
  ).map(extent => extent[1]);
  const bubbleSizeDomainMax = Math.max(...bubbleSizeMaxValues);

  return [0, bubbleSizeDomainMax];
};

export function getScatterPlotModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  hiddenSeries: string[],
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): ScatterPlotModel {
  // rawSeries has more than one element when two or more cards are combined on a dashboard
  const hasMultipleCards = rawSeries.length > 1;
  const cardsColumns = getCardsColumns(rawSeries, settings);
  const columnByDataKey = getCardsColumnByDataKeyMap(rawSeries, cardsColumns);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const unsortedSeriesModels = getCardsSeriesModels(
    rawSeries,
    cardsColumns,
    hiddenSeries,
    settings,
  );

  // We currently ignore sorting and visibility settings on combined cards
  const seriesModels = hasMultipleCards
    ? unsortedSeriesModels
    : getSortedSeriesModels(unsortedSeriesModels, settings);

  const unsortedDataset = getScatterPlotDataset(rawSeries, cardsColumns);
  const dataset = sortDataset(
    unsortedDataset,
    settings["graph.x_axis.scale"],
    showWarning,
  );
  const scaledDataset = scaleDataset(dataset, seriesModels, settings);

  const xAxisModel = getXAxisModel(
    dimensionModel,
    rawSeries,
    scaledDataset,
    settings,
    showWarning,
  );
  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const transformedDataset = applyVisualizationSettingsDataTransformations(
    scaledDataset,
    [],
    xAxisModel,
    seriesModels,
    yAxisScaleTransforms,
    settings,
    showWarning,
  );

  const { leftAxisModel, rightAxisModel } = getYAxesModels(
    seriesModels,
    dataset,
    transformedDataset,
    settings,
    columnByDataKey,
    false,
    [],
    false,
  );

  const trendLinesModel = getTrendLines(
    rawSeries,
    [leftAxisModel, rightAxisModel],
    yAxisScaleTransforms,
    seriesModels,
    transformedDataset,
    settings,
    [],
    renderingContext,
  );

  return {
    stackModels: [],
    dataset: scaledDataset,
    transformedDataset,
    seriesModels,
    yAxisScaleTransforms,
    columnByDataKey,
    dimensionModel,
    xAxisModel,
    leftAxisModel,
    rightAxisModel,
    trendLinesModel,
    bubbleSizeDomain: getBubbleSizeDomain(seriesModels, transformedDataset),
    seriesLabelsFormatters: {},
  };
}
