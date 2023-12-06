import d3 from "d3";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import _ from "underscore";
import Color from "color";
import type { RegisteredSeriesOption, EChartsOption } from "echarts";

import { getTrendDataPointsFromInsight } from "metabase/visualizations/lib/trends";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue, SeriesSettings } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";

import { applySquareRootScaling, replaceValues } from "../model/dataset";
import type { CartesianChartModel, DataKey } from "../model/types";
import { getSeriesYAxisIndex } from "./utils";

const TREND_LINE_DATA_KEY = "trend-line";

type TrendDataset = {
  [key: DataKey]: RowValue;
  [TREND_LINE_DATA_KEY]: number;
}[];

/**
 * Computes the dataset for a single series, based on its `insight` object.
 *
 * @param {Insight} insight - Insight object for a series
 * @param {CartesianChartModel} chartModel - Locally computed chart data
 * @returns {TrendDataset} Resultant dataset for the series with the given `insight` object
 */
function getSingleSeriesTrendDataset(
  insight: Insight,
  chartModel: CartesianChartModel,
): TrendDataset {
  const xValues = chartModel.dataset.map(
    // We know the value is a string because it has to be a timeseries aggregation
    row => moment(row[chartModel.dimensionModel.dataKey] as string),
  );
  const trendDataPoints = getTrendDataPointsFromInsight(
    insight,
    d3.extent(xValues),
    xValues.length,
  );

  return trendDataPoints.map(([_x, y], rowIndex) => ({
    [chartModel.dimensionModel.dataKey]:
      chartModel.dataset[rowIndex][chartModel.dimensionModel.dataKey],
    [TREND_LINE_DATA_KEY]: y,
  }));
}

/**
 * Normalizes the trend line datasets for each series, if the visualization is a normalized
 * stacked bar chart. Otherwise, it will just return the input datasets without any transformation.
 *
 * @param {TrendDataset[]} trendDatasets - Datasets for the trend lines for each series
 * @param {CartesianChartModel} chartModel - Locally computed chart data
 * @param {ComputedVisualizationSettings} settings - Locally computed visualization settings for the chart
 * @returns {TrendDataset[]} Resultant trend line datasets
 */
function normalizeTrendDatasets(
  trendDatasets: TrendDataset[],
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
): TrendDataset[] {
  if (settings["stackable.stack_type"] !== "normalized") {
    return trendDatasets;
  }

  // The chart should not be stacked if the series aren't either all bars, or all areas
  const seriesSettings: SeriesSettings[] = chartModel.seriesModels.map(
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

/**
 * Applies a square root function to all values in the datasets for all trend lines,
 * for use with the power y-axis scale.
 *
 * @param {TrendDataset[]} trendDatasets - Datasets for the trend lines for all series in the chart.
 * @param {ComputedVisualizationSettings} settings - Locally computed visualization settings for the chart
 * @returns {TrendDataset[]} Square-rooted datasets if the `graph.y_axis.scale` setting is `pow`,
 * otherwise the unchanged input datasets
 */
function squareRootScaleDatasets(
  trendDatasets: TrendDataset[],
  settings: ComputedVisualizationSettings,
): TrendDataset[] {
  if (settings["graph.y_axis.scale"] !== "pow") {
    return trendDatasets;
  }

  return trendDatasets.map(trendDataset =>
    replaceValues(trendDataset, (dataKey, value) =>
      dataKey === TREND_LINE_DATA_KEY ? applySquareRootScaling(value) : value,
    ),
  ) as TrendDataset[];
}

/**
 * Computes the dataset and series option objects needed by ECharts to render trend lines.
 * Each series in the chart model will have one corresponding dataset and option, in the same
 * order as the `chartModel.seriesModels` array.
 *
 * @param {CartesianChartModel} chartModel - Local computed data model for the chart
 * @param {ComputedVisualizationSettings} settings - Locally computed visualization settings for the chart
 * @param {RenderingContext} renderingContext - Misc. helpers provided by the environment (client or static-viz pipeline)
 * @returns Object ({ options, datasets }), each key is either `null` or an array
 */
export function getTrendLineOptionsAndDatasets(
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  options: RegisteredSeriesOption["line"][] | null;
  datasets: EChartsOption["dataset"][] | null;
} {
  // The trend line can only be shown when the question has only
  // a single aggregation on a time field. When this is not the case,
  // the backend will return null for the insights object, so our array
  // will have length 0.
  const canShowTrendLine = chartModel.insights.length !== 0;
  if (!settings["graph.show_trendline"] || !canShowTrendLine) {
    return { options: null, datasets: null };
  }
  if (chartModel.insights.length !== chartModel.seriesModels.length) {
    throw Error("Number of insight objects does not match number of series");
  }

  // series option objects for each trend line (one per series)
  const options: RegisteredSeriesOption["line"][] = chartModel.seriesModels.map(
    (seriesModel, index) => ({
      type: "line",
      datasetIndex: index + 1, // offset to account for the chart's dataset (e.g. question results)
      yAxisIndex: getSeriesYAxisIndex(seriesModel, chartModel),
      encode: {
        x: chartModel.dimensionModel.dataKey,
        y: TREND_LINE_DATA_KEY,
      },
      showSymbol: false,
      lineStyle: {
        color: Color(renderingContext.getColor(seriesModel.color))
          .lighten(0.25)
          .hex(),
        type: [5, 5],
        width: 2,
      },
    }),
  );

  // compute datasets for each trend line series
  const rawDatasets = chartModel.insights.map(insight =>
    getSingleSeriesTrendDataset(insight, chartModel),
  );
  const normalizedDatasets = normalizeTrendDatasets(
    rawDatasets,
    chartModel,
    settings,
  );
  const scaledDatasets = squareRootScaleDatasets(normalizedDatasets, settings);

  return {
    options,
    datasets: scaledDatasets.map(dataset => ({
      dimensions: [chartModel.dimensionModel.dataKey, TREND_LINE_DATA_KEY],
      source: dataset,
    })) as EChartsOption["dataset"][],
  };
}
