import { getIn } from "icepick";
import _ from "underscore";

import { formatNullable } from "metabase/lib/formatting/nullable";
import { parseTimestamp } from "metabase/lib/time";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";

import { dimensionIsNumeric } from "./numeric";
import { dimensionIsExplicitTimeseries } from "./timeseries";
import { invalidDateWarning, nullDimensionWarning } from "./warnings";

export function parseXValue(xValue, options, warn) {
  const { parsedValue, warning } = memoizedParseXValue(xValue, options);
  if (warning !== undefined) {
    warn(warning);
  }
  return parsedValue;
}

const memoizedParseXValue = _.memoize(
  (xValue, { isNumeric, isTimeseries, isQuantitative, unit }) => {
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

function getParseOptions({ settings, data }) {
  const columnIndex = getColumnIndex({ settings, data });
  return {
    isNumeric: dimensionIsNumeric(data, columnIndex),
    isTimeseries:
      // x axis scale is timeseries
      isTimeseries(settings) ||
      // column type is timeseries
      dimensionIsExplicitTimeseries(data, columnIndex),
    isQuantitative: isQuantitative(settings),
    unit: data.cols[columnIndex].unit,
  };
}

function canDisplayNull(settings) {
  // histograms are converted to ordinal scales, so we need this ugly logic as a workaround
  return !isOrdinal(settings) || isHistogram(settings);
}

export function getXValues({ settings, series }) {
  // if _raw isn't set then we already have the raw series
  const { _raw: rawSeries = series } = series;
  const warn = () => {}; // no op since warning in handled by getDatas
  const uniqueValues = new Set();
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
    let lastValue;
    for (const row of data.rows) {
      // non ordinal dimensions can't display null values, so we exclude them from xValues
      if (canDisplayNull(settings) && row[columnIndex] === null) {
        continue;
      }
      const value = parseXValue(row[columnIndex], parseOptions, warn);
      if (lastValue !== undefined) {
        isAscending = isAscending && lastValue <= value;
        isDescending = isDescending && value <= lastValue;
      }
      lastValue = value;
      uniqueValues.add(value);
    }
  }
  let xValues = Array.from(uniqueValues);
  if (isDescending) {
    // JavaScript's .sort() sorts lexicographically by default (e.x. 1, 10, 2)
    // We could implement a comparator but _.sortBy handles strings, numbers, and dates correctly
    xValues = _.sortBy(xValues, x => x).reverse();
  } else if (isAscending) {
    // default line/area charts to ascending since otherwise lines could be wonky
    xValues = _.sortBy(xValues, x => x);
  }
  return xValues;
}

function getColumnIndex({ settings, data: { cols } }) {
  const [dim] = settings["graph.dimensions"] || [];
  const i = cols.findIndex(c => c.name === dim);
  return i === -1 ? 0 : i;
}

// Crossfilter calls toString on each moment object, which calls format(), which is very slow.
// Replace toString with a function that just returns the unparsed ISO input date, since that works
// just as well and is much faster
function moment_fast_toString() {
  return this._i;
}

function parseTimestampAndWarn(value, unit) {
  if (value == null) {
    return { parsedValue: null, warning: nullDimensionWarning() };
  }
  const m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return { parsedValue: null, warning: invalidDateWarning(value) };
  }
  m.toString = moment_fast_toString;
  return { parsedValue: m };
}

/************************************************************ PROPERTIES ************************************************************/

export const isTimeseries = settings =>
  settings["graph.x_axis.scale"] === "timeseries";
export const isQuantitative = settings =>
  ["linear", "log", "pow"].indexOf(settings["graph.x_axis.scale"]) >= 0;
export const isHistogram = settings =>
  settings["graph.x_axis._scale_original"] === "histogram" ||
  settings["graph.x_axis.scale"] === "histogram";
export const isOrdinal = settings =>
  settings["graph.x_axis.scale"] === "ordinal";

export const isStacked = (settings, datas) => settings["stackable.stack_type"];
export const isNormalized = (settings, datas) =>
  settings["stackable.stack_type"] === "normalized";

// find the first nonempty single series
export const getFirstNonEmptySeries = series =>
  _.find(series, s => !datasetContainsNoResults(s.data));

function hasRemappingAndValuesAreStrings({ cols }, i = 0) {
  const column = cols[i];

  if (column.remapping && column.remapping.size > 0) {
    // We have remapped values, so check their type for determining whether the dimension is numeric
    // ES6 Map makes the lookup of first value a little verbose
    return typeof column.remapping.values().next().value === "string";
  } else {
    return false;
  }
}

export const isRemappedToString = series =>
  hasRemappingAndValuesAreStrings(getFirstNonEmptySeries(series).data);

export const hasClickBehavior = series =>
  getIn(series, [0, "card", "visualization_settings", "click_behavior"]) !=
  null;
