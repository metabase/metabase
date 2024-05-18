import { getYAxisModel } from "metabase/visualizations/echarts/cartesian/model/axis";
import {
  filterNullDimensionValues,
  getCardsColumnByDataKeyMap,
  getJoinedCardsDataset,
  sortDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getCardSeriesModels,
  getDimensionModel,
  getWaterfallLabelFormatter,
} from "metabase/visualizations/echarts/cartesian/model/series";
import type {
  BaseCartesianChartModel,
  ShowWarning,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getAxisTransforms } from "../../model/transforms";
import { WATERFALL_END_KEY, WATERFALL_TOTAL_KEY } from "../constants";

import { getWaterfallXAxisModel } from "./axis";
import {
  extendOriginalDatasetWithTotalDatum,
  getWaterfallDataset,
} from "./dataset";

export const getWaterfallChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): BaseCartesianChartModel => {
  // Waterfall chart support one card only
  const [singleRawSeries] = rawSeries;
  const { data } = singleRawSeries;

  const cardsColumns = [getCartesianChartColumns(data.cols, settings)];
  const columnByDataKey = getCardsColumnByDataKeyMap(rawSeries, cardsColumns);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const [seriesModel] = getCardSeriesModels(
    singleRawSeries,
    cardsColumns[0],
    false,
    true,
    settings,
    renderingContext,
  );

  let dataset = getJoinedCardsDataset(rawSeries, cardsColumns, showWarning);
  dataset = sortDataset(dataset, settings["graph.x_axis.scale"], showWarning);

  const xAxisModel = getWaterfallXAxisModel(
    dimensionModel,
    rawSeries,
    dataset,
    settings,
    renderingContext,
    showWarning,
  );
  if (
    xAxisModel.axisType === "value" ||
    xAxisModel.axisType === "time" ||
    xAxisModel.isHistogram
  ) {
    dataset = filterNullDimensionValues(dataset, showWarning);
  }

  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const transformedDataset = getWaterfallDataset(
    dataset,
    yAxisScaleTransforms,
    seriesModel.dataKey,
    settings,
    xAxisModel,
  );

  const { formatter: waterfallLabelFormatter, isCompact } =
    getWaterfallLabelFormatter(
      seriesModel,
      transformedDataset,
      settings,
      renderingContext,
    );

  // Pass waterfall dataset and keys for correct extent computation
  const leftAxisModel = getYAxisModel(
    [WATERFALL_END_KEY],
    [],
    [],
    transformedDataset,
    settings,
    { [WATERFALL_END_KEY]: seriesModel.column },
    null,
    renderingContext,
    {
      compact:
        settings["graph.label_value_formatting"] === "compact" || isCompact,
    },
  );

  // Extending the original dataset with total datum for tooltips
  const originalDatasetWithTotal = extendOriginalDatasetWithTotalDatum(
    dataset,
    transformedDataset[transformedDataset.length - 1],
    seriesModel.dataKey,
    settings,
  );

  return {
    stackModels: [],
    dataset: originalDatasetWithTotal,
    transformedDataset,
    seriesModels: [seriesModel],
    yAxisScaleTransforms,
    columnByDataKey,
    dimensionModel,
    xAxisModel,
    leftAxisModel,
    rightAxisModel: null,
    seriesIdToDataKey: {
      [WATERFALL_TOTAL_KEY]: seriesModel.dataKey,
    },
    waterfallLabelFormatter,
  };
};
