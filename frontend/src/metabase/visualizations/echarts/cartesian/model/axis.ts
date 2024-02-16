import d3 from "d3";
import _ from "underscore";
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
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  SeriesSettings,
  StackType,
  DatasetColumn,
  RowValue,
  RawSeries,
} from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import {
  getDatasetExtents,
  getMetricDisplayValueGetter,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import { getObjectEntries, getObjectKeys } from "metabase/lib/objects";
import {
  computeTimeseriesDataInverval,
  minTimeseriesUnit,
} from "metabase/visualizations/lib/timeseries";
import { computeNumericDataInverval } from "metabase/visualizations/lib/numeric";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";

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
    return (value: unknown) =>
      renderingContext.formatValue(value, {
        column,
        number_style: "percent",
      });
  }

  const valueGetter = getMetricDisplayValueGetter(settings);
  return (value: RowValue) => {
    const restoredValue = valueGetter(value);
    return renderingContext.formatValue(restoredValue, {
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

function getYAxisModel(
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

  const isHistogram = settings["graph.x_axis.scale"] === "histogram";

  const formatter = (value: RowValue) =>
    renderingContext.formatValue(value, {
      column: dimensionModel.column,
      ...(settings.column?.(dimensionModel.column) ?? {}),
      noRange: isHistogram,
    });

  const xValues = dataset.map(datum => datum[X_AXIS_DATA_KEY]);

  const timeSeriesInterval = getTimeSeriesXAxisInterval(
    xValues,
    rawSeries,
    dimensionModel,
  );
  const numericInterval = getNumericXAxisInterval(
    xValues,
    dimensionModel,
    settings,
  );
  return {
    formatter,
    label,
    timeSeriesInterval,
    numericInterval,
  };
}

// We should always have results_timezone, but just in case we fallback to UTC
export const DEFAULT_TIMEZONE = "Etc/UTC";

function getTimezone(rawSeries: RawSeries) {
  const { results_timezone } = rawSeries[0].data;
  return results_timezone || DEFAULT_TIMEZONE;
}

export function getTimeSeriesXAxisInterval(
  xValues: RowValue[],
  rawSeries: RawSeries,
  dimensionModel: DimensionModel,
): TimeSeriesInterval {
  // We need three pieces of information to define a timeseries range:
  // 1. interval - it's really the "unit": month, day, etc
  // 2. count - how many intervals per tick?
  // 3. timezone - what timezone are values in? days vary in length by timezone
  const unit = minTimeseriesUnit(
    dimensionModel.columns.map(column => column.unit),
  );
  const timezone = getTimezone(rawSeries);
  const { count, interval } = (computeTimeseriesDataInverval(xValues, unit) ?? {
    count: 1,
    interval: "day",
  }) as Pick<TimeSeriesInterval, "count" | "interval">;
  return { count, interval, timezone };
}

export function getNumericXAxisInterval(
  xValues: RowValue[],
  dimensionModel: DimensionModel,
  settings: ComputedVisualizationSettings,
) {
  if (
    ["linear", "log", "pow", "histogram"].includes(
      // @ts-expect-error x axis scale value can be undefined
      settings["graph.x_axis.scale"],
    )
  ) {
    return undefined;
  }

  const binningInfo = dimensionModel.column.binning_info;
  if (binningInfo) {
    return binningInfo.bin_width;
  }

  return computeNumericDataInverval(xValues);
}
