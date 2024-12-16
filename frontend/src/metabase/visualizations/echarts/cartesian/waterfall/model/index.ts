import { getYAxisModel } from "metabase/visualizations/echarts/cartesian/model/axis";
import {
  filterNullDimensionValues,
  getCardsColumnByDataKeyMap,
  getJoinedCardsDataset,
  scaleDataset,
  sortDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getCardSeriesModels,
  getDimensionModel,
  getWaterfallChartDataDensity,
  getWaterfallLabelFormatter,
} from "metabase/visualizations/echarts/cartesian/model/series";
import type { WaterfallChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ShowWarning } from "metabase/visualizations/echarts/types";
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
  hiddenSeries: string[],
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): WaterfallChartModel => {
  // Waterfall chart support one card only
  const [singleRawSeries] = rawSeries;
  const { data } = singleRawSeries;

  const cardsColumns = [getCartesianChartColumns(data.cols, settings)];
  const columnByDataKey = getCardsColumnByDataKeyMap(rawSeries, cardsColumns);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const [seriesModel] = getCardSeriesModels(
    singleRawSeries,
    cardsColumns[0],
    [],
    false,
    true,
    settings,
  );

  const unsortedDataset = getJoinedCardsDataset(
    rawSeries,
    cardsColumns,
    showWarning,
  );
  const dataset = sortDataset(
    unsortedDataset,
    settings["graph.x_axis.scale"],
    showWarning,
  );
  let scaledDataset = scaleDataset(dataset, [seriesModel], settings);

  const xAxisModel = getWaterfallXAxisModel(
    dimensionModel,
    rawSeries,
    scaledDataset,
    settings,
    showWarning,
  );
  if (
    xAxisModel.axisType === "value" ||
    xAxisModel.axisType === "time" ||
    xAxisModel.isHistogram
  ) {
    scaledDataset = filterNullDimensionValues(scaledDataset, showWarning);
  }

  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const transformedDataset = getWaterfallDataset(
    scaledDataset,
    yAxisScaleTransforms,
    seriesModel.dataKey,
    settings,
    xAxisModel,
  );

  const { formatter: waterfallLabelFormatter, isCompact } =
    getWaterfallLabelFormatter(seriesModel, transformedDataset, settings);

  const dataDensity = getWaterfallChartDataDensity(
    transformedDataset,
    waterfallLabelFormatter,
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
    {
      compact:
        settings["graph.label_value_formatting"] === "compact" || isCompact,
    },
  );

  // Extending the original dataset with total datum for tooltips
  const originalDatasetWithTotal = extendOriginalDatasetWithTotalDatum(
    scaledDataset,
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
    dataDensity,
    seriesLabelsFormatters: {},
  };
};
