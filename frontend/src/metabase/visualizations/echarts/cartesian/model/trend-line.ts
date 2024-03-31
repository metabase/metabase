import Color from "color";
import d3 from "d3";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import _ from "underscore";

import {
  TREND_LINE_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getTrendDataPointsFromInsight } from "metabase/visualizations/lib/trends";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";

import { replaceValues } from "./dataset";
import type {
  ChartDataset,
  NumericAxisScaleTransforms,
  SeriesModel,
  TrendDataset,
  TrendLineSeriesModel,
} from "./types";

/**
 * Computes the dataset for a single series, based on its `insight` object.
 *
 * @param {Insight} insight - Insight object for a series
 * @param {ChartDataset} dataset - Dataset for the series
 * @returns {TrendDataset} Resultant dataset for the series with the given `insight` object
 */
function getSingleSeriesTrendDataset(
  insight: Insight,
  dataset: ChartDataset,
): TrendDataset {
  const xValues = dataset.map(
    // We know the value is a string because it has to be a timeseries aggregation
    row => moment(row[X_AXIS_DATA_KEY] as string),
  );
  const trendDataPoints = getTrendDataPointsFromInsight(
    insight,
    d3.extent(xValues),
    xValues.length,
  );

  return trendDataPoints.map(([_x, y], rowIndex) => ({
    [X_AXIS_DATA_KEY]: dataset[rowIndex][X_AXIS_DATA_KEY],
    [TREND_LINE_DATA_KEY]: y,
  }));
}

/**
 * Normalizes the trend line datasets for each series, if the visualization is a normalized
 * stacked bar chart. Otherwise, it will just return the input datasets without any transformation.
 *
 * @param {TrendDataset[]} trendDatasets - Datasets for the trend lines for each series
 * @param {SeriesModel[]} seriesModels - Locally computed series models
 * @param {ComputedVisualizationSettings} settings - Locally computed visualization settings for the chart
 * @returns {TrendDataset[]} Resultant trend line datasets
 */
function normalizeTrendDatasets(
  trendDatasets: TrendDataset[],
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): TrendDataset[] {
  if (settings["stackable.stack_type"] !== "normalized") {
    return trendDatasets;
  }

  // The chart should not be stacked if the series aren't either all bars, or all areas
  const seriesSettings: SeriesSettings[] = seriesModels.map(
    ({ legacySeriesSettingsObjectKey }) =>
      settings.series(legacySeriesSettingsObjectKey),
  );
  const allBar = seriesSettings.every(({ display }) => display === "bar");
  const allArea = seriesSettings.every(({ display }) => display === "area");
  if (!(allBar || allArea)) {
    return trendDatasets;
  }

  // For each row in the chart dataset (e.g. question results), compute the sum
  // of the trend line value at that row for all series.
  const rowCount = trendDatasets[0].length;
  const trendLineTotals = _.range(rowCount).map(rowIndex =>
    trendDatasets.reduce(
      (total, trendDataset) =>
        total + trendDataset[rowIndex][TREND_LINE_DATA_KEY],
      0,
    ),
  );

  return trendDatasets.map(trendDataset =>
    trendDataset.map((row, rowIndex) => ({
      ...row,
      [TREND_LINE_DATA_KEY]:
        row[TREND_LINE_DATA_KEY] / trendLineTotals[rowIndex],
    })),
  );
}

export function getTrendLineModelAndDatasets(
  seriesModels: SeriesModel[],
  dataset: ChartDataset,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  rawInsights: Insight[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  trendLinesSeries: TrendLineSeriesModel[];
  trendLinesDataset: TrendDataset;
} {
  // The trend line can only be shown when the question has only a single
  // aggregation on a time field. When this is not the case, the backend will
  // return null for the insights object, so our array will have length 0.
  const canShowTrendLine = rawInsights.length !== 0;
  if (!settings["graph.show_trendline"] || !canShowTrendLine) {
    return {
      trendLinesSeries: [],
      trendLinesDataset: [],
    };
  }

  // Filter out insight objects that are not used for any series (e.g. columns
  // not visualized)
  const legacySeriesKeys = new Set(
    seriesModels.map(
      seriesModel => seriesModel.legacySeriesSettingsObjectKey.card._seriesKey,
    ),
  );
  const insights = rawInsights.filter(insight =>
    legacySeriesKeys.has(insight.col),
  );
  if (insights.length !== seriesModels.length) {
    throw Error("Number of insight objects does not match number of series");
  }

  // compute datasets for each trend line series
  const rawDatasets = insights.map(insight =>
    getSingleSeriesTrendDataset(insight, dataset),
  );
  const normalizedDatasets = normalizeTrendDatasets(
    rawDatasets,
    seriesModels,
    settings,
  );
  const transformedDatasets = normalizedDatasets.map(dataset =>
    replaceValues(dataset, (dataKey, value) =>
      dataKey === TREND_LINE_DATA_KEY
        ? yAxisScaleTransforms.toEChartsAxisValue(value)
        : value,
    ),
  );

  const trendLinesDataset = transformedDatasets.map(dataset => ({
    dimensions: [X_AXIS_DATA_KEY, TREND_LINE_DATA_KEY],
    source: dataset,
  }));

  const trendLinesSeries: TrendLineSeriesModel[] = seriesModels.map(
    seriesModel => ({
      name: `${seriesModel.name}; trend line`, // not used in UI
      color: Color(renderingContext.getColor(seriesModel.color))
        .lighten(0.25)
        .hex(),
      dataKey: TREND_LINE_DATA_KEY,
    }),
  );

  return {
    trendLinesSeries,
    trendLinesDataset,
  };
}
