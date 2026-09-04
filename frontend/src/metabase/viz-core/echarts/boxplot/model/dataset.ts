import type { RowValue } from "metabase-types/api";

import { INDEX_KEY, X_AXIS_DATA_KEY } from "../../cartesian/constants/dataset";
import type {
  ChartDataset,
  DataKey,
  Datum,
  NumericAxisScaleTransforms,
} from "../../cartesian/model/types";
import { getBoxPlotStatKey, getSeriesXValueKey } from "../utils";

import type {
  BoxPlotDatum,
  BoxPlotRawDataPoint,
  BoxPlotSeriesModel,
  BoxPlotWhiskerType,
} from "./types";

type SeriesStatKeys = {
  dataKey: DataKey;
  minKey: DataKey;
  q1Key: DataKey;
  medianKey: DataKey;
  q3Key: DataKey;
  maxKey: DataKey;
  meanKey: DataKey;
};

const getQuantile = (
  sortedDataPoints: BoxPlotRawDataPoint[],
  quantile: number,
): number => {
  const length = sortedDataPoints.length;
  if (length === 0) {
    return 0;
  }
  if (length === 1) {
    return sortedDataPoints[0].value;
  }

  const index = (length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const fraction = index - lowerIndex;

  if (fraction === 0) {
    return sortedDataPoints[lowerIndex].value;
  }

  const lowerValue = sortedDataPoints[lowerIndex].value;
  const upperValue = sortedDataPoints[lowerIndex + 1].value;
  return lowerValue + fraction * (upperValue - lowerValue);
};

const findFirstIndexGreaterOrEqual = (
  sortedDataPoints: BoxPlotRawDataPoint[],
  target: number,
): number => {
  let left = 0;
  let right = sortedDataPoints.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedDataPoints[mid].value < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
};

const findFirstIndexGreaterThan = (
  sortedDataPoints: BoxPlotRawDataPoint[],
  target: number,
): number => {
  let left = 0;
  let right = sortedDataPoints.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedDataPoints[mid].value <= target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
};

type DataPointGroup = {
  dataPoints: BoxPlotRawDataPoint[];
  sum: number;
};

const computeBoxPlotDatum = (
  xValue: RowValue,
  group: DataPointGroup,
  seriesKey: DataKey,
  seriesIndex: number,
  whiskerType: BoxPlotWhiskerType,
): BoxPlotDatum | null => {
  const { dataPoints } = group;
  const length = dataPoints.length;
  if (length === 0) {
    return null;
  }

  const sortedDataPoints = [...dataPoints].sort((a, b) => a.value - b.value);

  const min = sortedDataPoints[0].value;
  const max = sortedDataPoints[length - 1].value;
  const q1 = getQuantile(sortedDataPoints, 0.25);
  const median = getQuantile(sortedDataPoints, 0.5);
  const q3 = getQuantile(sortedDataPoints, 0.75);
  const mean = group.sum / length;

  if (whiskerType === "min-max") {
    return {
      xValue,
      seriesKey,
      seriesIndex,
      min,
      q1,
      median,
      q3,
      max,
      mean,
      outliers: [],
      rawDataPoints: sortedDataPoints,
    };
  }

  const iqr = q3 - q1;
  const lowerBoundValue = q1 - 1.5 * iqr;
  const upperBoundValue = q3 + 1.5 * iqr;

  const firstNonOutlierIndex = findFirstIndexGreaterOrEqual(
    sortedDataPoints,
    lowerBoundValue,
  );
  const firstUpperOutlierIndex = findFirstIndexGreaterThan(
    sortedDataPoints,
    upperBoundValue,
  );

  const rawWhiskerMin =
    firstNonOutlierIndex < length
      ? sortedDataPoints[firstNonOutlierIndex].value
      : q1;
  const rawWhiskerMax =
    firstUpperOutlierIndex > 0
      ? sortedDataPoints[firstUpperOutlierIndex - 1].value
      : q3;

  const whiskerMin = Math.min(rawWhiskerMin, q1);
  const whiskerMax = Math.max(rawWhiskerMax, q3);

  const outliers: number[] = [];
  for (let i = 0; i < firstNonOutlierIndex; i++) {
    outliers.push(sortedDataPoints[i].value);
  }
  for (let i = firstUpperOutlierIndex; i < length; i++) {
    outliers.push(sortedDataPoints[i].value);
  }

  return {
    xValue,
    seriesKey,
    seriesIndex,
    min: whiskerMin,
    q1,
    median,
    q3,
    max: whiskerMax,
    mean,
    outliers,
    rawDataPoints: sortedDataPoints,
  };
};

export const computeMultiSeriesBoxPlotData = (
  dataset: ChartDataset,
  dimensionDataKey: DataKey,
  seriesModels: BoxPlotSeriesModel[],
  whiskerType: BoxPlotWhiskerType,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
): {
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>;
  xValues: RowValue[];
  boxDataset: ChartDataset;
  outlierAbovePointsDataset: ChartDataset;
  outlierBelowPointsDataset: ChartDataset;
  nonOutlierPointsDataset: ChartDataset;
} => {
  const seriesDataKeys = seriesModels.map((s) => s.dataKey);
  const seriesIndexMap = new Map(seriesModels.map((s, i) => [s.dataKey, i]));

  const dataPointGroups = new Map<string, DataPointGroup>();
  const groupKeyToSeriesXValue = new Map<
    string,
    { seriesKey: DataKey; xValue: RowValue }
  >();
  const uniqueXValues = new Set<RowValue>();

  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    const xValue = row[dimensionDataKey];
    uniqueXValues.add(xValue);

    seriesDataKeys.forEach((seriesKey) => {
      const value = row[seriesKey];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
      }

      const groupKey = getSeriesXValueKey(seriesKey, xValue);
      let group = dataPointGroups.get(groupKey);
      if (group === undefined) {
        group = { dataPoints: [], sum: 0 };
        dataPointGroups.set(groupKey, group);
        groupKeyToSeriesXValue.set(groupKey, { seriesKey, xValue });
      }
      group.dataPoints.push({ value, datum: row, index: i });
      group.sum += value;
    });
  }

  const xValues = Array.from(uniqueXValues);

  const dataBySeriesAndXValue = new Map<DataKey, Map<RowValue, BoxPlotDatum>>(
    seriesModels.map((s) => [s.dataKey, new Map()]),
  );

  dataPointGroups.forEach((group, groupKey) => {
    const { seriesKey, xValue } = groupKeyToSeriesXValue.get(groupKey)!;
    const seriesIndex = seriesIndexMap.get(seriesKey)!;

    const boxPlotDatum = computeBoxPlotDatum(
      xValue,
      group,
      seriesKey,
      seriesIndex,
      whiskerType,
    );

    if (boxPlotDatum) {
      dataBySeriesAndXValue.get(seriesKey)!.set(xValue, boxPlotDatum);
    }
  });

  const { toEChartsAxisValue } = yAxisScaleTransforms;
  const boxDataset = buildBoxDataset(
    xValues,
    seriesModels,
    dataBySeriesAndXValue,
    toEChartsAxisValue,
  );

  const {
    outlierAbovePointsDataset,
    outlierBelowPointsDataset,
    nonOutlierPointsDataset,
  } = buildPointsDatasets(
    dataset,
    seriesModels,
    dataBySeriesAndXValue,
    toEChartsAxisValue,
  );

  return {
    dataBySeriesAndXValue,
    xValues,
    boxDataset,
    outlierAbovePointsDataset,
    outlierBelowPointsDataset,
    nonOutlierPointsDataset,
  };
};

const buildBoxDataset = (
  xValues: RowValue[],
  seriesModels: BoxPlotSeriesModel[],
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>,
  toEChartsAxisValue: (value: number) => number | null,
): ChartDataset => {
  const seriesStatKeys: SeriesStatKeys[] = seriesModels.map((seriesModel) => ({
    dataKey: seriesModel.dataKey,
    minKey: getBoxPlotStatKey(seriesModel.dataKey, "min"),
    q1Key: getBoxPlotStatKey(seriesModel.dataKey, "q1"),
    medianKey: getBoxPlotStatKey(seriesModel.dataKey, "median"),
    q3Key: getBoxPlotStatKey(seriesModel.dataKey, "q3"),
    maxKey: getBoxPlotStatKey(seriesModel.dataKey, "max"),
    meanKey: getBoxPlotStatKey(seriesModel.dataKey, "mean"),
  }));

  return xValues.map((xValue) => {
    const row: Datum = {
      [X_AXIS_DATA_KEY]: xValue,
    };

    for (const keys of seriesStatKeys) {
      const datum = dataBySeriesAndXValue.get(keys.dataKey)?.get(xValue);
      if (!datum) {
        row[keys.minKey] = NaN;
        row[keys.q1Key] = NaN;
        row[keys.medianKey] = NaN;
        row[keys.q3Key] = NaN;
        row[keys.maxKey] = NaN;
        row[keys.meanKey] = NaN;
        continue;
      }

      row[keys.minKey] = toEChartsAxisValue(datum.min) ?? NaN;
      row[keys.q1Key] = toEChartsAxisValue(datum.q1) ?? NaN;
      row[keys.medianKey] = toEChartsAxisValue(datum.median) ?? NaN;
      row[keys.q3Key] = toEChartsAxisValue(datum.q3) ?? NaN;
      row[keys.maxKey] = toEChartsAxisValue(datum.max) ?? NaN;
      row[keys.meanKey] = toEChartsAxisValue(datum.mean) ?? NaN;
    }

    return row;
  });
};

type PointsDatasetsResult = {
  outlierAbovePointsDataset: ChartDataset;
  outlierBelowPointsDataset: ChartDataset;
  nonOutlierPointsDataset: ChartDataset;
};

const buildPointsDatasets = (
  rawDataset: ChartDataset,
  seriesModels: BoxPlotSeriesModel[],
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>,
  toEChartsAxisValue: (value: number) => number | null,
): PointsDatasetsResult => {
  const outlierAboveRows: Datum[] = [];
  const outlierBelowRows: Datum[] = [];
  const nonOutlierRows: Datum[] = [];

  for (let i = 0; i < rawDataset.length; i++) {
    const rawRow = rawDataset[i];
    const xValue = rawRow[X_AXIS_DATA_KEY];
    let hasOutlierAbove = false;
    let hasOutlierBelow = false;
    let hasNonOutlier = false;

    const outlierAboveRow: Datum = {
      [X_AXIS_DATA_KEY]: xValue,
      [INDEX_KEY]: i,
    };
    const outlierBelowRow: Datum = {
      [X_AXIS_DATA_KEY]: xValue,
      [INDEX_KEY]: i,
    };
    const nonOutlierRow: Datum = {
      [X_AXIS_DATA_KEY]: xValue,
      [INDEX_KEY]: i,
    };

    for (const seriesModel of seriesModels) {
      const value = rawRow[seriesModel.dataKey];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }

      const transformed = toEChartsAxisValue(value);
      if (transformed == null) {
        continue;
      }

      const datum = dataBySeriesAndXValue.get(seriesModel.dataKey)?.get(xValue);
      if (!datum) {
        continue;
      }

      const isOutlierAbove = value > datum.max;
      const isOutlierBelow = value < datum.min;

      if (isOutlierAbove) {
        outlierAboveRow[seriesModel.dataKey] = transformed;
        hasOutlierAbove = true;
      } else if (isOutlierBelow) {
        outlierBelowRow[seriesModel.dataKey] = transformed;
        hasOutlierBelow = true;
      } else {
        nonOutlierRow[seriesModel.dataKey] = transformed;
        hasNonOutlier = true;
      }
    }

    if (hasOutlierAbove) {
      outlierAboveRows.push(outlierAboveRow);
    }
    if (hasOutlierBelow) {
      outlierBelowRows.push(outlierBelowRow);
    }
    if (hasNonOutlier) {
      nonOutlierRows.push(nonOutlierRow);
    }
  }

  return {
    outlierAbovePointsDataset: outlierAboveRows,
    outlierBelowPointsDataset: outlierBelowRows,
    nonOutlierPointsDataset: nonOutlierRows,
  };
};
