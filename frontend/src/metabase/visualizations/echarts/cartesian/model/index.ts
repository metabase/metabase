import { OTHER_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  getXAxisModel,
  getYAxesModels,
} from "metabase/visualizations/echarts/cartesian/model/axis";
import {
  applyVisualizationSettingsDataTransformations,
  getCardsColumnByDataKeyMap,
  getJoinedCardsDataset,
  getSortedSeriesModels,
  scaleDataset,
  sortDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getCardsSeriesModels,
  getComboChartDataDensity,
  getDimensionModel,
  getFormatters,
} from "metabase/visualizations/echarts/cartesian/model/series";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getSingleSeriesDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import { getAreDimensionsAndMetricsValid } from "metabase/visualizations/shared/settings/cartesian-chart";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, SingleSeries } from "metabase-types/api";

import type { ShowWarning } from "../../types";

import {
  createOtherGroupSeriesModel,
  groupSeriesIntoOther,
} from "./other-series";
import { getStackModels } from "./stack";
import { getAxisTransforms } from "./transforms";
import { getTrendLines } from "./trend-line";

// HACK: when multiple cards (datasets) are combined on a single dashboard card
// the settings prop of the visualization contains only one set of metrics and dimensions
// which by design is not sufficient for multiple cards. At the same time, not all cards settings
// contain saved "graph.dimensions" and "graph.metrics" so we have to get defaults if they are not present.
const getSettingsWithDefaultMetricsAndDimensions = (series: SingleSeries) => {
  const {
    card: { visualization_settings: settings },
  } = series;
  if (getAreDimensionsAndMetricsValid([series])) {
    return settings;
  }

  const { dimensions, metrics } = getSingleSeriesDimensionsAndMetrics(series);
  const settingsWithDefaults = { ...settings };

  settingsWithDefaults["graph.dimensions"] = dimensions;
  settingsWithDefaults["graph.metrics"] = metrics;

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
  hiddenSeries: string[],
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
    hiddenSeries,
    settings,
    renderingContext.formatValue,
  );

  // We currently ignore sorting and visibility settings on combined cards
  const ungroupedSeriesModels = hasMultipleCards
    ? unsortedSeriesModels
    : getSortedSeriesModels(unsortedSeriesModels, settings);

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
  const scaledDataset = scaleDataset(dataset, ungroupedSeriesModels, settings);

  const { ungroupedSeriesModels: seriesModels, groupedSeriesModels } =
    groupSeriesIntoOther(dataset, ungroupedSeriesModels, settings);

  const [sampleGroupedModel] = groupedSeriesModels;
  if (sampleGroupedModel) {
    seriesModels.push(
      createOtherGroupSeriesModel(
        sampleGroupedModel.column,
        sampleGroupedModel.columnIndex,
        settings,
        !hiddenSeries.includes(OTHER_DATA_KEY),
        renderingContext,
      ),
    );
  }

  const groupedSeriesKeys = groupedSeriesModels.map(
    seriesModel => seriesModel.dataKey,
  );

  const xAxisModel = getXAxisModel(
    dimensionModel,
    rawSeries,
    scaledDataset,
    settings,
    renderingContext,
    showWarning,
  );
  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const stackModels = getStackModels(seriesModels, settings);

  const transformedDataset = applyVisualizationSettingsDataTransformations(
    scaledDataset,
    stackModels,
    xAxisModel,
    seriesModels,
    groupedSeriesKeys,
    yAxisScaleTransforms,
    settings,
    showWarning,
  );

  const {
    seriesLabelsFormatters,
    stackedLabelsFormatters,
    isCompactFormatting,
  } = getFormatters(
    seriesModels,
    stackModels,
    scaledDataset,
    settings,
    renderingContext,
  );

  const dataDensity = getComboChartDataDensity(
    seriesModels,
    stackModels,
    dataset,
    seriesLabelsFormatters,
    stackedLabelsFormatters,
    settings,
    renderingContext,
  );

  const { leftAxisModel, rightAxisModel } = getYAxesModels(
    seriesModels,
    dataset,
    transformedDataset,
    settings,
    columnByDataKey,
    true,
    stackModels,
    isCompactFormatting,
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
    seriesLabelsFormatters,
    stackedLabelsFormatters,
    dataDensity,
    groupedSeriesModels,
  };
};
