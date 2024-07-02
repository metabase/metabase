import Color from "color";
import _ from "underscore";

import { checkNumber, isNotNull } from "metabase/lib/types";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getTrendLineFunction } from "metabase/visualizations/lib/trends";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { msToDays, tryGetDate } from "../utils/timeseries";

import { getScaledMinAndMax } from "./axis";
import {
  getKeyBasedDatasetTransform,
  getNormalizedDatasetTransform,
  transformDataset,
} from "./dataset";
import type {
  ChartDataset,
  DataKey,
  Datum,
  NumericAxisScaleTransforms,
  SeriesModel,
  StackModel,
  TrendLineSeriesModel,
  TrendLinesModel,
  YAxisModel,
} from "./types";

type TrendFn = (days: number) => number;

const getTrendKeyForSeries = (dataKey: DataKey) => `${dataKey}_trend`;

const getSeriesModelsWithTrends = (
  rawSeries: RawSeries,
  seriesModels: SeriesModel[],
): [SeriesModel, TrendFn][] => {
  return seriesModels
    .map(seriesModel => {
      // Breakout series do not support trend lines because the data grouping happens on the client
      if ("breakoutColumn" in seriesModel) {
        return null;
      }

      const seriesDataset = rawSeries.find(
        series =>
          series.card.id === seriesModel.cardId ||
          (series.card.id == null && seriesModel.cardId == null),
      )?.data;

      const insight = seriesDataset?.insights?.find(
        insight => insight.col === seriesModel.column.name,
      );

      if (!insight) {
        return null;
      }

      const trendFunction = getTrendLineFunction(insight);

      const resultTuple: [SeriesModel, TrendFn] = [seriesModel, trendFunction];
      return resultTuple;
    })
    .filter(isNotNull);
};

// When y-axis auto range is disabled we limit trend line values with the y-axis ranges so that trend lines cannot expand them
const getLimitTrendLineTransform = (
  seriesModels: TrendLineSeriesModel[],
  yAxisModels: [YAxisModel | null, YAxisModel | null],
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
) => {
  const { customMin, customMax } = getScaledMinAndMax(
    settings,
    yAxisScaleTransforms,
  );

  return (datum: Datum) => {
    const transformedDatum = { ...datum };

    seriesModels.forEach(seriesModel => {
      const axis = yAxisModels.find(yAxisModel =>
        yAxisModel?.seriesKeys.includes(seriesModel.sourceDataKey),
      );

      if (!axis) {
        throw new Error(
          `Missing y-axis for series with key ${seriesModel.sourceDataKey}`,
        );
      }

      const trendValue = transformedDatum[seriesModel.dataKey];
      const minBoundary =
        customMin != null && customMin < axis.extent[0]
          ? customMin
          : axis.extent[0];
      const maxBoundary =
        customMax != null && customMax > axis.extent[1]
          ? customMax
          : axis.extent[1];

      if (checkNumber(trendValue) < minBoundary) {
        transformedDatum[seriesModel.dataKey] = minBoundary;
      } else if (checkNumber(trendValue) > maxBoundary) {
        transformedDatum[seriesModel.dataKey] = maxBoundary;
      }
    });

    return transformedDatum;
  };
};

export const getTrendLines = (
  rawSeries: RawSeries,
  yAxisModels: [YAxisModel | null, YAxisModel | null],
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  seriesModels: SeriesModel[],
  chartDataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  stackModels: StackModel[],
  renderingContext: RenderingContext,
): TrendLinesModel | undefined => {
  if (!settings["graph.show_trendline"]) {
    return;
  }

  const seriesModelsWithTrends = getSeriesModelsWithTrends(
    rawSeries,
    seriesModels,
  );

  if (seriesModelsWithTrends.length === 0) {
    return;
  }

  const dataset = chartDataset.map(datum => {
    const trendDatum: Datum = {
      [X_AXIS_DATA_KEY]: datum[X_AXIS_DATA_KEY],
    };

    seriesModelsWithTrends.forEach(([seriesModel, trendFn]) => {
      const trendLineDataKey = getTrendKeyForSeries(seriesModel.dataKey);

      const date = tryGetDate(datum[X_AXIS_DATA_KEY]);
      if (date != null) {
        trendDatum[trendLineDataKey] = trendFn(msToDays(date.valueOf()));
      }
    });

    return trendDatum;
  });

  const trendSeriesModels: TrendLineSeriesModel[] = seriesModelsWithTrends.map(
    ([seriesModel]) => ({
      dataKey: getTrendKeyForSeries(seriesModel.dataKey),
      sourceDataKey: seriesModel.dataKey,
      name: `${seriesModel.name}; trend line`, // not used in UI
      color: Color(renderingContext.getColor(seriesModel.color))
        .lighten(0.25)
        .hex(),
    }),
  );
  const dataKeys = trendSeriesModels.map(seriesModel => seriesModel.dataKey);

  const transformedDataset = transformDataset(dataset, [
    {
      condition: settings["stackable.stack_type"] === "normalized",
      fn: getNormalizedDatasetTransform(
        stackModels.map(stackModel => ({
          ...stackModel,
          seriesKeys: stackModel.seriesKeys.map(getTrendKeyForSeries),
        })),
      ),
    },
    getKeyBasedDatasetTransform(dataKeys, value =>
      yAxisScaleTransforms.toEChartsAxisValue(value),
    ),
    {
      condition: !settings["graph.y_axis.auto_range"],
      fn: getLimitTrendLineTransform(
        trendSeriesModels,
        yAxisModels,
        yAxisScaleTransforms,
        settings,
      ),
    },
  ]);

  return {
    dataset: transformedDataset,
    seriesModels: trendSeriesModels,
  };
};
