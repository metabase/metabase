import { t } from "ttag";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  replaceValues,
  replaceZeroesForLogScale,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  DataKey,
  ChartDataset,
  Datum,
  WaterfallXAxisModel,
  NumericAxisScaleTransforms,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  WATERFALL_DATA_KEYS,
  WATERFALL_END_KEY,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { isNumericAxis, isTimeSeriesAxis } from "../../model/guards";
import { getColumnScaling } from "../../model/util";

export const getWaterfallDataset = (
  dataset: ChartDataset,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  xAxisModel: WaterfallXAxisModel,
): ChartDataset => {
  let transformedDataset: ChartDataset = [];

  const scale = getColumnScaling(seriesModel.column, settings);

  const key = seriesModel.dataKey;
  dataset.forEach((datum, index) => {
    const prevDatum = index === 0 ? null : transformedDataset[index - 1];
    const scaledValue = Number.isFinite(datum[key])
      ? (datum[key] as number) * scale
      : null;

    let start;
    let end;
    if (prevDatum == null) {
      start = 0;
      end = scaledValue;
    } else {
      start = getNumberOr(prevDatum.end, 0);
      end = start + getNumberOr(scaledValue, 0);
    }

    if (
      (isTimeSeriesAxis(xAxisModel) || isNumericAxis(xAxisModel)) &&
      datum[X_AXIS_DATA_KEY] == null
    ) {
      return;
    }

    const waterfallDatum: Datum = {
      [X_AXIS_DATA_KEY]: datum[X_AXIS_DATA_KEY] ?? NULL_DISPLAY_VALUE,
      [WATERFALL_VALUE_KEY]: scaledValue,
      [WATERFALL_START_KEY]: start,
      [WATERFALL_END_KEY]: end,
    };

    transformedDataset.push(waterfallDatum);
  });

  if (
    typeof xAxisModel.totalXValue !== "undefined" &&
    transformedDataset.length > 0
  ) {
    const lastDatum = transformedDataset[transformedDataset.length - 1];
    transformedDataset.push({
      [X_AXIS_DATA_KEY]: xAxisModel.totalXValue,
      [WATERFALL_END_KEY]: lastDatum[WATERFALL_END_KEY],
      [WATERFALL_VALUE_KEY]: lastDatum[WATERFALL_END_KEY],
      [WATERFALL_START_KEY]: 0,
      [WATERFALL_TOTAL_KEY]: lastDatum[WATERFALL_END_KEY],
    });
  }

  if (settings["graph.y_axis.scale"] === "log") {
    transformedDataset = replaceZeroesForLogScale(
      transformedDataset,
      WATERFALL_DATA_KEYS,
    );
  }

  if (isTimeSeriesAxis(xAxisModel)) {
    transformedDataset = replaceValues(
      transformedDataset,
      (dataKey: DataKey, value: RowValue) =>
        dataKey === X_AXIS_DATA_KEY
          ? xAxisModel.toEChartsAxisValue(value)
          : value,
    );
  }

  return replaceValues(
    transformedDataset,
    (dataKey: DataKey, value: RowValue) =>
      WATERFALL_DATA_KEYS.includes(dataKey)
        ? yAxisScaleTransforms.toEChartsAxisValue(value)
        : value,
  );
};

export const extendOriginalDatasetWithTotalDatum = (
  dataset: ChartDataset,
  waterfallDatasetTotalDatum: Datum,
  seriesDataKey: DataKey,
  settings: ComputedVisualizationSettings,
) => {
  if (dataset.length === 0 || !settings["waterfall.show_total"]) {
    return dataset;
  }

  const totalDatum: Datum = {
    [seriesDataKey]: waterfallDatasetTotalDatum[WATERFALL_TOTAL_KEY],
    [X_AXIS_DATA_KEY]: t`Total`,
  };

  return [...dataset, totalDatum];
};
