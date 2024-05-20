import {
  getXAxisModel,
  getYAxesModels,
} from "metabase/visualizations/echarts/cartesian/model/axis";
import {
  getBubbleSizeDomain,
  getCardsColumnByDataKeyMap,
  getJoinedCardsDataset,
  getSortedSeriesModels,
  applyVisualizationSettingsDataTransformations,
  sortDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getCardsSeriesModels,
  getDimensionModel,
  getSeriesLabelsFormatters,
  getStackedLabelsFormatters,
} from "metabase/visualizations/echarts/cartesian/model/series";
import type {
  CartesianChartModel,
  ShowWarning,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getScatterPlotDataset } from "metabase/visualizations/echarts/cartesian/scatter/model";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getSingleSeriesDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, SingleSeries } from "metabase-types/api";

import { getStackModels } from "./stack";
import { getAxisTransforms } from "./transforms";
import { getTrendLines } from "./trend-line";

const SUPPORTED_AUTO_SPLIT_TYPES = ["line", "area", "bar", "combo"];

// HACK: when multiple cards (datasets) are combined on a single dashboard card
// the settings prop of the visualization contains only one set of metrics and dimensions
// which by design is not sufficient for multiple cards. At the same time, not all cards settings
// contain saved "graph.dimensions" and "graph.metrics" so we have to get defaults if they are not present.
const getSettingsWithDefaultMetricsAndDimensions = (series: SingleSeries) => {
  const {
    card: { visualization_settings: settings },
  } = series;
  if (
    settings["graph.dimensions"] != null &&
    settings["graph.metrics"] != null
  ) {
    return settings;
  }

  const { dimensions, metrics } = getSingleSeriesDimensionsAndMetrics(series);
  const settingsWithDefaults = { ...settings };

  settingsWithDefaults["graph.dimensions"] ??= dimensions;
  settingsWithDefaults["graph.metrics"] ??= metrics;

  return settingsWithDefaults;
};

export const getCardsColumns = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  return rawSeries.map(series => {
    const { data } = series;
    // When multiple cards are combined on a dashboard card, computed visualization settings contain
    // dimensions and metrics settings of the first card only which is not correct.
    // Using the raw visualization settings for that is safe because we can combine
    // only saved cards that have these settings.
    const shouldUseIndividualCardSettings = rawSeries.length > 1;

    if (!shouldUseIndividualCardSettings) {
      return getCartesianChartColumns(data.cols, settings);
    }

    const cardSettings = getSettingsWithDefaultMetricsAndDimensions(series);
    return getCartesianChartColumns(data.cols, cardSettings);
  });
};

export const getCartesianChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): CartesianChartModel => {
  // rawSeries has more than one element when two or more cards are combined on a dashboard
  const hasMultipleCards = rawSeries.length > 1;
  const cardsColumns = getCardsColumns(rawSeries, settings);
  const columnByDataKey = getCardsColumnByDataKeyMap(rawSeries, cardsColumns);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const unsortedSeriesModels = getCardsSeriesModels(
    rawSeries,
    cardsColumns,
    settings,
    renderingContext,
  );

  // We currently ignore sorting and visibility settings on combined cards
  const seriesModels = hasMultipleCards
    ? unsortedSeriesModels
    : getSortedSeriesModels(unsortedSeriesModels, settings);

  let dataset;
  switch (rawSeries[0].card.display) {
    case "scatter":
      dataset = getScatterPlotDataset(rawSeries, cardsColumns);
      break;
    default:
      dataset = getJoinedCardsDataset(rawSeries, cardsColumns, showWarning);
  }
  dataset = sortDataset(dataset, settings["graph.x_axis.scale"], showWarning);

  const xAxisModel = getXAxisModel(
    dimensionModel,
    rawSeries,
    dataset,
    settings,
    renderingContext,
    showWarning,
  );
  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const stackModels = getStackModels(seriesModels, settings);

  const transformedDataset = applyVisualizationSettingsDataTransformations(
    dataset,
    stackModels,
    xAxisModel,
    seriesModels,
    yAxisScaleTransforms,
    settings,
    showWarning,
  );

  const isAutoSplitSupported = SUPPORTED_AUTO_SPLIT_TYPES.includes(
    rawSeries[0].card.display,
  );

  const { formatters: seriesLabelsFormatters, compactSeriesDataKeys } =
    getSeriesLabelsFormatters(
      seriesModels,
      transformedDataset,
      settings,
      renderingContext,
    );

  const { formatters: stackedLabelsFormatters, compactStackedSeriesDataKeys } =
    getStackedLabelsFormatters(
      seriesModels,
      stackModels,
      transformedDataset,
      settings,
      renderingContext,
    );

  const { leftAxisModel, rightAxisModel } = getYAxesModels(
    seriesModels,
    transformedDataset,
    settings,
    columnByDataKey,
    isAutoSplitSupported,
    stackModels,
    [...compactSeriesDataKeys, ...compactStackedSeriesDataKeys],
    renderingContext,
  );

  const trendLinesModel = getTrendLines(
    rawSeries,
    [leftAxisModel, rightAxisModel],
    yAxisScaleTransforms,
    seriesModels,
    transformedDataset,
    settings,
    stackModels,
    renderingContext,
  );

  return {
    stackModels,
    dataset,
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
    seriesLabelsFormatters,
    stackedLabelsFormatters,
  };
};
