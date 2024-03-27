import d3 from "d3";
import _ from "underscore";
import dayjs from "dayjs";
import type {
  AxisFormatter,
  DataKey,
  Extent,
  ChartDataset,
  SeriesExtents,
  SeriesModel,
  XAxisModel,
  YAxisModel,
  DimensionModel,
  TimeSeriesInterval,
  DateRange,
  TimeSeriesXAxisModel,
  NumericXAxisModel,
  NumericAxisScaleTransforms,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { numericScale } from "metabase-types/api";
import type {
  DateTimeAbsoluteUnit,
  SeriesSettings,
  StackType,
  DatasetColumn,
  RowValue,
  RawSeries,
  NumericScale,
} from "metabase-types/api";
import { isNotNull, isNumber } from "metabase/lib/types";
import {
  getDatasetExtents,
  getSeriesExtent,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getObjectEntries,
  getObjectKeys,
  getObjectValues,
} from "metabase/lib/objects";
import {
  computeTimeseriesDataInverval,
  getTimezone,
  minTimeseriesUnit,
  tryGetDate,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import {
  ECHARTS_CATEGORY_AXIS_NULL_VALUE,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";
import { computeNumericDataInverval } from "metabase/visualizations/lib/numeric";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";

const KEYS_TO_COMPARE = new Set([
  "number_style",
  "currency",
  "currency_style",
  "number_separators",
  "decimals",
  "scale",
  "prefix",
  "suffix",
]);

export function getLineAreaBarComparisonSettings(
  columnSettings: Record<string, unknown>,
) {
  return _.pick(columnSettings, (value, key) => {
    if (!KEYS_TO_COMPARE.has(key)) {
      return false;
    }
    if ((key === "prefix" || key === "suffix") && value === "") {
      return false;
    }
    return true;
  });
}

const getAggregateColumnsCount = (seriesModels: SeriesModel[]) => {
  return _.uniq(
    seriesModels
      .map(seriesModel => seriesModel.column)
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  ).length;
};

export function shouldAutoSplitYAxis(
  settings: ComputedVisualizationSettings,
  seriesModels: SeriesModel[],
  seriesExtents: SeriesExtents,
) {
  const hasSingleCard =
    seriesModels.reduce((cardIds, seriesModel) => {
      cardIds.add(seriesModel.cardId);
      return cardIds;
    }, new Set<number | undefined>()).size === 1;

  if (
    settings["graph.y_axis.auto_split"] === false ||
    (hasSingleCard && getAggregateColumnsCount(seriesModels) < 2) ||
    settings["stackable.stack_type"] != null
  ) {
    return false;
  }

  const allMetricsColumns = seriesModels.map(seriesModel => seriesModel.column);

  const hasDifferentYAxisColTypes =
    _.uniq(allMetricsColumns.map(column => column.semantic_type)).length > 1;

  if (hasDifferentYAxisColTypes) {
    return true;
  }

  const allMetricsColumnSettings = allMetricsColumns
    .map(column => settings.column?.(column))
    .filter(isNotNull);

  const columnSettings = allMetricsColumnSettings.map(columnSettings =>
    getLineAreaBarComparisonSettings(columnSettings),
  );

  const hasDifferentColumnSettings = columnSettings.some(s1 =>
    columnSettings.some(s2 => !_.isEqual(s1, s2)),
  );

  if (hasDifferentColumnSettings) {
    return true;
  }

  const yExtents = Object.values(seriesExtents);

  const minRange = Math.min(...yExtents.map(extent => extent[1] - extent[0]));
  const maxExtent = Math.max(...yExtents.map(extent => extent[1]));
  const minExtent = Math.min(...yExtents.map(extent => extent[0]));
  const chartRange = maxExtent - minExtent;

  // Note (EmmadUsmani): When the series with the smallest range is less than 5%
  // of the chart's total range, we split the y-axis so it doesn't look too small.
  return minRange / chartRange <= 0.05;
}

type AxisSplit = [DataKey[], DataKey[]];

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;
const SPLIT_AXIS_MAX_DEPTH = 8;

function generateSplits(
  list: DataKey[],
  left: DataKey[] = [],
  right: DataKey[] = [],
  depth = 0,
): AxisSplit[] {
  // NOTE: currently generates all permutations, some of which are equivalent
  if (list.length === 0) {
    return [[left, right]];
  } else if (depth > SPLIT_AXIS_MAX_DEPTH) {
    // If we reach our max depth, we need to ensure that any item that haven't been added either list are accounted for
    return left.length < right.length
      ? [[left.concat(list), right]]
      : [[left, right.concat(list)]];
  } else {
    return [
      ...generateSplits(
        list.slice(1),
        left.concat([list[0]]),
        right,
        depth + 1,
      ),
      ...generateSplits(
        list.slice(1),
        left,
        right.concat([list[0]]),
        depth + 1,
      ),
    ];
  }
}

function axisCost(extents: Extent[], favorUnsplit = true) {
  const axisExtent = d3.extent(extents.flatMap(e => e));
  const axisRange = axisExtent[1] - axisExtent[0];
  if (favorUnsplit && extents.length === 0) {
    return SPLIT_AXIS_UNSPLIT_COST;
  } else if (axisRange === 0) {
    return 0;
  } else {
    return extents.reduce(
      (sum, seriesExtent) =>
        sum +
        Math.pow(
          axisRange / (seriesExtent[1] - seriesExtent[0]),
          SPLIT_AXIS_COST_FACTOR,
        ),
      0,
    );
  }
}

export function computeSplit(
  extents: SeriesExtents,
  left: DataKey[] = [],
  right: DataKey[] = [],
): AxisSplit {
  const unassigned: DataKey[] = getObjectKeys(extents).filter(
    key => left.indexOf(key) < 0 && right.indexOf(key) < 0,
  );

  // if any are assigned to right we have decided to split so don't favor unsplit
  const favorUnsplit = right.length > 0;

  const cost = (split: [DataKey[], DataKey[]]) =>
    axisCost(
      split[0].map(dataKey => extents[dataKey]),
      favorUnsplit,
    ) +
    axisCost(
      split[1].map(dataKey => extents[dataKey]),
      favorUnsplit,
    );

  const splits = generateSplits(unassigned, left, right);

  let best: AxisSplit = [[], []];
  let bestCost = Infinity;
  for (const split of splits) {
    const splitCost = cost(split);
    if (!best || splitCost < bestCost) {
      best = split;
      bestCost = splitCost;
    }
  }

  return best;
}

export const getYAxisSplit = (
  seriesModels: SeriesModel[],
  seriesExtents: SeriesExtents,
  settings: ComputedVisualizationSettings,
  isAutoSplitSupported: boolean,
): AxisSplit => {
  const axisBySeriesKey = seriesModels.reduce((acc, seriesModel) => {
    const seriesSettings: SeriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );

    acc[seriesModel.dataKey] = seriesSettings?.["axis"];
    return acc;
  }, {} as Record<DataKey, string | undefined>);

  const left: DataKey[] = [];
  const right: DataKey[] = [];
  const auto: DataKey[] = [];
  for (const [dataKey, axis] of getObjectEntries(axisBySeriesKey)) {
    if (axis === "left") {
      left.push(dataKey);
    } else if (axis === "right") {
      right.push(dataKey);
    } else {
      auto.push(dataKey);
    }
  }

  if (
    isAutoSplitSupported &&
    shouldAutoSplitYAxis(settings, seriesModels, seriesExtents)
  ) {
    // NOTE: this version computes the split after assigning fixed left/right
    // which causes other series to move around when changing the setting
    // return computeSplit(yExtents, left, right);

    // NOTE: this version computes a split with all axis unassigned, then moves
    // assigned ones to their correct axis
    const [autoLeft, autoRight] = computeSplit(seriesExtents);
    return [
      _.uniq([
        ...left,
        ...autoLeft.filter(dataKey => !axisBySeriesKey[dataKey]),
      ]),
      _.uniq([
        ...right,
        ...autoRight.filter(dataKey => !axisBySeriesKey[dataKey]),
      ]),
    ];
  } else {
    // assign all auto to the left
    return [[...left, ...auto], right];
  }
};

const calculateStackedExtent = (
  seriesKeys: DataKey[],
  data: ChartDataset,
): Extent => {
  let min = 0;
  let max = 0;

  data.forEach(entry => {
    let positiveStack = 0;
    let negativeStack = 0;
    seriesKeys.forEach(key => {
      const value = entry[key];
      if (typeof value === "number") {
        if (value >= 0) {
          positiveStack += value;
        } else {
          negativeStack += value;
        }
      }
    });
    min = Math.min(min, negativeStack);
    max = Math.max(max, positiveStack);
  });

  return [min, max];
};

function calculateNonStackedExtent(
  seriesKeys: DataKey[],
  data: ChartDataset,
): Extent {
  let min = Infinity;
  let max = -Infinity;

  data.forEach(entry => {
    seriesKeys.forEach(key => {
      const value = entry[key];
      if (typeof value === "number") {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
  });

  if (min === Infinity || max === -Infinity) {
    return [0, 0];
  }

  return [min, max];
}

const NORMALIZED_RANGE: Extent = [0, 1];

const getYAxisFormatter = (
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): AxisFormatter => {
  const isNormalized = settings["stackable.stack_type"] === "normalized";

  if (isNormalized) {
    return (value: RowValue) =>
      renderingContext.formatValue(value, {
        column,
        number_style: "percent",
      });
  }

  return (value: RowValue) => {
    if (!isNumber(value)) {
      return " ";
    }

    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
    });
  };
};

export const getYAxisLabel = (
  axisSeriesKeys: DataKey[],
  axisColumn: DatasetColumn,
  settings: ComputedVisualizationSettings,
) => {
  if (settings["graph.y_axis.labels_enabled"] === false) {
    return undefined;
  }

  const specifiedAxisName = settings["graph.y_axis.title_text"];

  if (specifiedAxisName != null) {
    return specifiedAxisName;
  }

  if (axisSeriesKeys.length > 1) {
    return undefined;
  }

  return axisColumn.display_name;
};

function getYAxisExtent(
  seriesKeys: DataKey[],
  dataset: ChartDataset,
  stackType?: StackType,
): Extent {
  if (dataset.length === 0) {
    return [0, 0];
  }

  if (stackType === "normalized") {
    return NORMALIZED_RANGE;
  }

  return stackType === "stacked"
    ? calculateStackedExtent(seriesKeys, dataset)
    : calculateNonStackedExtent(seriesKeys, dataset);
}

export function getYAxisModel(
  seriesKeys: DataKey[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  columnByDataKey: Record<DataKey, DatasetColumn>,
  renderingContext: RenderingContext,
): YAxisModel | null {
  if (seriesKeys.length === 0) {
    return null;
  }

  const stackType = settings["stackable.stack_type"];

  const extent = getYAxisExtent(seriesKeys, dataset, stackType);
  const column = columnByDataKey[seriesKeys[0]];
  const label = getYAxisLabel(seriesKeys, column, settings);
  const formatter = getYAxisFormatter(column, settings, renderingContext);

  return {
    seriesKeys,
    extent,
    column,
    label,
    formatter,
  };
}

export function getYAxesModels(
  seriesModels: SeriesModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  columnByDataKey: Record<DataKey, DatasetColumn>,
  isAutoSplitSupported: boolean,
  renderingContext: RenderingContext,
) {
  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);
  const extents = getDatasetExtents(seriesDataKeys, dataset);

  const [leftAxisSeries, rightAxisSeries]: AxisSplit = getYAxisSplit(
    seriesModels,
    extents,
    settings,
    isAutoSplitSupported,
  );

  return {
    leftAxisModel: getYAxisModel(
      leftAxisSeries,
      dataset,
      settings,
      columnByDataKey,
      renderingContext,
    ),
    rightAxisModel: getYAxisModel(
      rightAxisSeries,
      dataset,
      settings,
      columnByDataKey,
      renderingContext,
    ),
  };
}

export function getTimeSeriesXAxisModel(
  dimensionModel: DimensionModel,
  rawSeries: RawSeries,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  label: string | undefined,
  renderingContext: RenderingContext,
): TimeSeriesXAxisModel {
  const xValues = dataset.map(datum => datum[X_AXIS_DATA_KEY]);
  const dimensionColumn = dimensionModel.column;

  // Based on the actual data compute interval, range, etc.
  const timeSeriesInfo = getTimeSeriesXAxisInfo(
    xValues,
    rawSeries,
    dimensionModel,
  );
  const { interval: dataTimeSeriesInterval } = timeSeriesInfo;
  const formatter = (value: RowValue, unit?: DateTimeAbsoluteUnit) => {
    const formatUnit =
      unit ??
      dimensionColumn.unit ??
      (isAbsoluteDateTimeUnit(dataTimeSeriesInterval.unit)
        ? dataTimeSeriesInterval.unit
        : undefined);
    const column: DatasetColumn = {
      ...dimensionColumn,
      unit: formatUnit,
    };
    const columnSettings = settings.column?.(column) ?? {};
    const params = {
      ...columnSettings,
      compact: settings["graph.x_axis.axis_enabled"] === "compact",
      column,
    };

    return renderingContext.formatValue(value, params);
  };

  const fromAxisValue = (rawValue: number) => {
    // FIXME: properly fix timezone mismatch
    return dayjs(rawValue);
  };

  return {
    label,
    formatter,
    axisType: "time",
    fromAxisValue,
    ...timeSeriesInfo,
  };
}

const getSign = (value: number) => (value >= 0 ? 1 : -1);

const getAxisTransforms = (scale: NumericScale): NumericAxisScaleTransforms => {
  if (scale === "pow") {
    return {
      toEChartsAxisValue: value => {
        if (!isNumber(value)) {
          return null;
        }
        return Math.sqrt(Math.abs(value)) * getSign(value);
      },
      fromEChartsAxisValue: value => {
        return Math.pow(value, 2) * getSign(value);
      },
    };
  }

  if (scale === "log") {
    return {
      toEChartsAxisValue: value => {
        if (!isNumber(value)) {
          return null;
        }
        return Math.log10(Math.abs(value)) * getSign(value);
      },
      fromEChartsAxisValue: value => {
        return Math.pow(10, Math.abs(value)) * getSign(value);
      },
    };
  }

  return {
    toEChartsAxisValue: value => {
      if (!isNumber(value)) {
        return null;
      }
      return value;
    },
    fromEChartsAxisValue: value => value,
  };
};

function getNumericXAxisModel(
  dimensionModel: DimensionModel,
  dataset: ChartDataset,
  scale: NumericScale,
  settings: ComputedVisualizationSettings,
  label: string | undefined,
  isPadded: boolean,
  renderingContext: RenderingContext,
): NumericXAxisModel {
  const axisTransforms = getAxisTransforms(scale);
  const dimensionColumn = dimensionModel.column;
  const rawExtent = getSeriesExtent(dataset, X_AXIS_DATA_KEY) ?? [0, 0];
  const extent: Extent = [
    axisTransforms.toEChartsAxisValue(rawExtent[0]) ?? 0,
    axisTransforms.toEChartsAxisValue(rawExtent[1]) ?? 0,
  ];

  const xValues = dataset.map(datum => datum[X_AXIS_DATA_KEY]);
  const interval =
    dimensionColumn.binning_info?.bin_width ??
    computeNumericDataInverval(xValues);

  const formatter = (value: RowValue) =>
    renderingContext.formatValue(value, {
      column: dimensionColumn,
      ...(settings.column?.(dimensionColumn) ?? {}),
      compact: settings["graph.x_axis.axis_enabled"] === "compact",
    });

  const intervalsCount = (extent[1] - extent[0]) / interval;
  const ticksMaxInterval = dimensionColumn.binning_info?.bin_width;

  return {
    label,
    isPadded,
    formatter,
    axisType: "value",
    extent,
    interval,
    intervalsCount,
    ticksMaxInterval,
    ...axisTransforms,
  };
}

export const isNumeric = (
  scale: ComputedVisualizationSettings["graph.x_axis.scale"],
): scale is NumericScale => {
  return numericScale.includes(scale as NumericScale);
};

export function getXAxisModel(
  dimensionModel: DimensionModel,
  rawSeries: RawSeries,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): XAxisModel {
  const label = settings["graph.x_axis.labels_enabled"]
    ? settings["graph.x_axis.title_text"]
    : undefined;

  const xAxisScale = settings["graph.x_axis.scale"];

  if (xAxisScale === "timeseries") {
    return getTimeSeriesXAxisModel(
      dimensionModel,
      rawSeries,
      dataset,
      settings,
      label,
      renderingContext,
    );
  }

  if (isNumeric(xAxisScale)) {
    return getNumericXAxisModel(
      dimensionModel,
      dataset,
      xAxisScale,
      settings,
      label,
      rawSeries[0].card.display !== "scatter",
      renderingContext,
    );
  }

  const isHistogram = settings["graph.x_axis.scale"] === "histogram";
  const dimensionColumn = dimensionModel.column;

  const formatter = (value: RowValue) => {
    if (value === ECHARTS_CATEGORY_AXIS_NULL_VALUE) {
      return NULL_DISPLAY_VALUE;
    }

    return renderingContext.formatValue(value, {
      column: dimensionColumn,
      ...(settings.column?.(dimensionColumn) ?? {}),
      compact: settings["graph.x_axis.axis_enabled"] === "compact",
      noRange: isHistogram,
    });
  };

  const histogramInterval = isHistogram
    ? dimensionColumn.binning_info?.bin_width ??
      computeNumericDataInverval(dataset.map(datum => datum[X_AXIS_DATA_KEY]))
    : undefined;

  return {
    formatter,
    label,
    isHistogram,
    histogramInterval,
    axisType: "category",
  };
}

const getXAxisDateRangeFromSortedXAxisValues = (
  xValues: RowValue[],
): DateRange | undefined => {
  if (xValues.length === 0) {
    return undefined;
  }

  // Find the first non-null date from the start
  let minDateIndex = 0;
  while (
    minDateIndex < xValues.length &&
    tryGetDate(xValues[minDateIndex]) === null
  ) {
    minDateIndex++;
  }

  // Find the first non-null date from the end
  let maxDateIndex = xValues.length - 1;
  while (maxDateIndex >= 0 && tryGetDate(xValues[maxDateIndex]) === null) {
    maxDateIndex--;
  }

  // Assume the dataset is sorted
  const minDate = tryGetDate(xValues[minDateIndex]);
  const maxDate = tryGetDate(xValues[maxDateIndex]);

  if (minDate == null || maxDate == null) {
    return undefined;
  }

  return [minDate, maxDate];
};

function getTimeSeriesXAxisInfo(
  xValues: RowValue[],
  rawSeries: RawSeries,
  dimensionModel: DimensionModel,
) {
  // We need three pieces of information to define a timeseries range:
  // 1. interval - it's really the "unit": month, day, etc
  // 2. count - how many intervals per tick?
  // 3. timezone - what timezone are values in? days vary in length by timezone
  const unit = minTimeseriesUnit(
    getObjectValues(dimensionModel.columnByCardId)
      .map(column => (isAbsoluteDateTimeUnit(column.unit) ? column.unit : null))
      .filter(isNotNull),
  );
  const timezone = getTimezone(rawSeries);
  const interval = (computeTimeseriesDataInverval(xValues, unit) ?? {
    count: 1,
    unit: "day",
  }) as TimeSeriesInterval;

  const range = getXAxisDateRangeFromSortedXAxisValues(xValues);

  if (!range) {
    throw new Error("Missing range");
  }

  let intervalsCount = 0;

  if (range) {
    const [min, max] = range;
    // A single date counts as one interval
    intervalsCount = Math.max(
      1,
      Math.ceil(max.diff(min, interval.unit) / interval.count),
    );
  }

  return { interval, timezone, intervalsCount, range, unit };
}
