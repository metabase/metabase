import { t } from "ttag";
import dayjs from "dayjs";
import type { RowValue } from "metabase-types/api";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  DataKey,
  ChartDataset,
  XAxisModel,
  Datum,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  applySquareRootScaling,
  replaceValues,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

import {
  WATERFALL_DATA_KEYS,
  WATERFALL_END_2_KEY,
  WATERFALL_END_KEY,
  WATERFALL_START_2_KEY,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";
import { isNotNull, isNumber } from "metabase/lib/types";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import { tryGetDate } from "../../utils/time-series";

const replaceZerosForLogScale = (dataset: ChartDataset): ChartDataset => {
  let hasZeros = false;
  let minNonZeroValue = Infinity;

  dataset.forEach(datum => {
    const datumNumericValues = [
      getNumberOr(datum[WATERFALL_START_KEY], null),
      getNumberOr(datum[WATERFALL_END_KEY], null),
    ].filter(isNotNull);

    hasZeros = datumNumericValues.includes(0);

    minNonZeroValue = Math.min(
      minNonZeroValue,
      ...datumNumericValues.filter(number => number !== 0),
    );
  });

  if (!hasZeros && minNonZeroValue > 0) {
    return dataset;
  }

  if (minNonZeroValue < 0) {
    throw Error(t`X-axis must not cross 0 when using log scale.`);
  }

  const zeroReplacementValue = minNonZeroValue > 1 ? 1 : minNonZeroValue;

  return replaceValues(dataset, (dataKey: DataKey, value: RowValue) =>
    dataKey !== X_AXIS_DATA_KEY && value === 0 ? zeroReplacementValue : value,
  );
};

const getTotalTimeSeriesXValue = (
  lastDimensionValue: RowValue,
  { timeSeriesInterval }: XAxisModel,
) => {
  const lastDimensionValueDate = tryGetDate(lastDimensionValue);
  if (lastDimensionValueDate == null || timeSeriesInterval == null) {
    return null;
  }
  const { interval, count } = timeSeriesInterval;

  if (!isAbsoluteDateTimeUnit(interval)) {
    return null;
  }

  // @ts-expect-error fix quarter types in dayjs
  return dayjs(lastDimensionValue).add(count, interval).toISOString();
};

export const getWaterfallDataset = (
  dataset: ChartDataset,
  originalSeriesKey: DataKey,
  settings: ComputedVisualizationSettings,
  xAxisModel: XAxisModel,
  hasTotal: boolean,
): ChartDataset => {
  let transformedDataset: ChartDataset = [];

  dataset.forEach((datum, index) => {
    const prevDatum = index === 0 ? null : transformedDataset[index - 1];
    const rawValue = datum[originalSeriesKey];
    const value = isNumber(rawValue) ? rawValue : 0;

    const start = prevDatum == null ? 0 : prevDatum.end;
    const end =
      prevDatum == null ? value : getNumberOr(prevDatum?.end, 0) + value;

    const waterfallDatum: Datum = {
      [X_AXIS_DATA_KEY]: datum[X_AXIS_DATA_KEY],
      [WATERFALL_VALUE_KEY]: end - getNumberOr(start, 0),
      [WATERFALL_START_KEY]: start,
      [WATERFALL_END_KEY]: end,
      // Candlestick series which we use for Waterfall bars requires having four unique dimensions
      [WATERFALL_START_2_KEY]: start,
      [WATERFALL_END_2_KEY]: end,
    };

    transformedDataset.push(waterfallDatum);
  });

  if (hasTotal && transformedDataset.length > 0) {
    const lastDatum = transformedDataset[transformedDataset.length - 1];
    const lastValue = lastDatum.end;

    let totalXValue;
    if (
      settings["graph.x_axis.scale"] === "timeseries" &&
      (typeof lastValue === "string" || typeof lastValue === "number")
    ) {
      totalXValue = getTotalTimeSeriesXValue(
        lastDatum[X_AXIS_DATA_KEY],
        xAxisModel,
      );
    } else {
      totalXValue = t`Total`;
    }

    transformedDataset.push({
      [X_AXIS_DATA_KEY]: totalXValue,
      [WATERFALL_END_KEY]: lastDatum[WATERFALL_END_KEY],
      [WATERFALL_VALUE_KEY]: lastDatum[WATERFALL_END_KEY],
      [WATERFALL_START_KEY]: 0,
      [WATERFALL_TOTAL_KEY]: lastDatum[WATERFALL_END_KEY],
    });
  }

  if (settings["graph.y_axis.scale"] === "pow") {
    transformedDataset = replaceValues(
      transformedDataset,
      (dataKey: DataKey, value: RowValue) =>
        WATERFALL_DATA_KEYS.includes(dataKey)
          ? applySquareRootScaling(value)
          : value,
    );
  } else if (settings["graph.y_axis.scale"] === "log") {
    transformedDataset = replaceZerosForLogScale(transformedDataset);
  }

  return transformedDataset;
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
