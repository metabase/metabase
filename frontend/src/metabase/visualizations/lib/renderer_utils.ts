import type { Dayjs } from "dayjs";
import { getIn } from "icepick";
import _ from "underscore";

import { formatNullable } from "metabase/utils/formatting/nullable";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type {
  DatasetData,
  DatetimeUnit,
  RawSeries,
  RowValue,
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { isObjectWithRaw } from "metabase-types/guards";

import { dimensionIsNumeric } from "./numeric";
import { dimensionIsExplicitTimeseries } from "./timeseries";
import {
  type VisualizationWarning,
  invalidDateWarning,
  nullDimensionWarning,
} from "./warnings";

type ParseOptions = {
  isNumeric?: boolean;
  isTimeseries?: boolean;
  isQuantitative?: boolean;
  unit?: DatetimeUnit;
};

type Warn = (warning: VisualizationWarning) => void;

export function parseXValue(
  xValue: RowValue,
  options: ParseOptions,
  warn: Warn = () => undefined,
): RowValue | Dayjs {
  const { parsedValue, warning } = memoizedParseXValue(xValue, options);
  if (warning !== undefined) {
    warn(warning);
  }
  return parsedValue;
}

const memoizedParseXValue = _.memoize(
  (
    xValue: RowValue,
    { isNumeric, isTimeseries, isQuantitative, unit }: ParseOptions,
  ): {
    parsedValue: RowValue | Dayjs;
    warning?: VisualizationWarning;
  } => {
    // don't parse as timestamp if we're going to display as a quantitative
    // scale, e.x. years and Unix timestamps
    if (isTimeseries && !isQuantitative) {
      return parseTimestampAndWarn(xValue, unit);
    }
    const parsedValue = isNumeric ? xValue : String(formatNullable(xValue));
    return { parsedValue };
  },
  // create cache key from args
  // we need typeof so "2" and 2 don't have the same cache key
  (x, options) => [x, typeof x, ...Object.values(options)].join(),
);

function getParseOptions({
  data,
  settings,
}: {
  data: DatasetData;
  settings: VisualizationSettings;
}): ParseOptions {
  const columnIndex = getColumnIndex({ settings, data });
  return {
    isNumeric: dimensionIsNumeric(data, columnIndex),
    isTimeseries:
      // x axis scale is timeseries
      isTimeseries(settings) ||
      // column type is timeseries
      dimensionIsExplicitTimeseries(data, columnIndex),
    isQuantitative: isQuantitative(settings),
    unit: data.cols[columnIndex]?.unit,
  };
}

function canDisplayNull(settings: VisualizationSettings): boolean {
  // histograms are converted to ordinal scales, so we need this ugly logic as a workaround
  return !isOrdinal(settings) || isHistogram(settings);
}

export function getXValues({
  series,
  settings,
}: {
  series: Series;
  settings: VisualizationSettings;
}) {
  // if _raw isn't set then we already have the raw series
  const rawSeries =
    isObjectWithRaw(series) && series._raw ? series._raw : series;
  const warn = () => undefined; // no op since warning in handled by getDatas
  const uniqueValues = new Set<Exclude<RowValue, null | undefined> | Dayjs>();
  let isAscending = true;
  let isDescending = true;
  for (const { data } of rawSeries) {
    // In the raw series, the dimension isn't necessarily in the first element
    // of each row. This finds the correct column index.
    const columnIndex = getColumnIndex({ settings, data });
    if (!data.cols[columnIndex]) {
      continue;
    }

    const parseOptions = getParseOptions({ settings, data });
    let lastValue: RowValue | undefined;
    for (const row of data.rows) {
      // non ordinal dimensions can't display null values, so we exclude them from xValues
      if (canDisplayNull(settings) && row[columnIndex] === null) {
        continue;
      }
      const value = parseXValue(row[columnIndex], parseOptions, warn);
      if (lastValue !== undefined && value != null) {
        isAscending = isAscending && (lastValue ?? 0) <= value;
        isDescending = isDescending && value <= (lastValue ?? 0);
      }
      lastValue = value;
      if (value != null) {
        uniqueValues.add(value);
      }
    }
  }
  let xValues = Array.from(uniqueValues);
  if (isDescending) {
    // JavaScript's .sort() sorts lexicographically by default (e.x. 1, 10, 2)
    // We could implement a comparator but _.sortBy handles strings, numbers, and dates correctly
    xValues = _.sortBy(xValues, (x) => x).reverse();
  } else if (isAscending) {
    // default line/area charts to ascending since otherwise lines could be wonky
    xValues = _.sortBy(xValues, (x) => x);
  }
  return xValues;
}

function getColumnIndex({
  settings,
  data: { cols },
}: {
  data: DatasetData;
  settings: VisualizationSettings;
}) {
  const [dim] = settings["graph.dimensions"] || [];
  const i = cols.findIndex((c) => c.name === dim);
  return i === -1 ? 0 : i;
}

// Crossfilter calls toString on each dayjs object, which calls format(), which is very slow.
// Replace toString with a function that just returns the unparsed ISO input date, since that works
// just as well and is much faster
function dayjs_fast_toString(this: { _i: string }): string {
  return this._i;
}

function parseTimestampAndWarn(
  value: RowValue,
  unit?: DatetimeUnit,
): { parsedValue: Dayjs | null; warning?: VisualizationWarning } {
  if (value == null) {
    return { parsedValue: null, warning: nullDimensionWarning() };
  }
  const m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return { parsedValue: null, warning: invalidDateWarning(value) };
  }
  m.toString = dayjs_fast_toString;
  return { parsedValue: m };
}

/************************************************************ PROPERTIES ************************************************************/

export const isTimeseries = (settings: VisualizationSettings): boolean =>
  settings["graph.x_axis.scale"] === "timeseries";

export const isQuantitative = (settings: VisualizationSettings): boolean =>
  ["linear", "log", "pow"].indexOf(String(settings["graph.x_axis.scale"])) >= 0;

export const isHistogram = (settings: VisualizationSettings): boolean =>
  settings["graph.x_axis._scale_original"] === "histogram" ||
  settings["graph.x_axis.scale"] === "histogram";

export const isOrdinal = (settings: VisualizationSettings): boolean =>
  settings["graph.x_axis.scale"] === "ordinal";

export const isStacked = (settings: VisualizationSettings) =>
  settings["stackable.stack_type"];

export const isNormalized = (settings: VisualizationSettings) =>
  settings["stackable.stack_type"] === "normalized";

// find the first nonempty single series
export const getFirstNonEmptySeries = (
  series: RawSeries,
): SingleSeries | undefined =>
  _.find(series, (s) => !datasetContainsNoResults(s.data));

function hasRemappingAndValuesAreStrings(
  { cols }: DatasetData,
  i = 0,
): boolean {
  const column = cols[i];

  if (column?.remapping && column.remapping.size > 0) {
    // We have remapped values, so check their type for determining whether the dimension is numeric
    // ES6 Map makes the lookup of first value a little verbose
    return typeof column.remapping.values().next().value === "string";
  } else {
    return false;
  }
}

export const isRemappedToString = (series: RawSeries): boolean => {
  const nonEmptySeries = getFirstNonEmptySeries(series)?.data;

  return nonEmptySeries
    ? hasRemappingAndValuesAreStrings(nonEmptySeries)
    : false;
};

export const hasClickBehavior = (series: Series): boolean =>
  getIn(series, [0, "card", "visualization_settings", "click_behavior"]) !=
  null;
