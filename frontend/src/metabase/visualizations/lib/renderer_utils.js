/// Utility functions used by both the LineAreaBar renderer and the RowRenderer

import _ from "underscore";
import { getIn } from "icepick";
import { t } from "ttag";

import { datasetContainsNoResults } from "metabase/lib/dataset";
import { parseTimestamp } from "metabase/lib/time";

import { dimensionIsNumeric } from "./numeric";
import {
  dimensionIsTimeseries,
  dimensionIsExplicitTimeseries,
} from "./timeseries";
import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";
import { invalidDateWarning, nullDimensionWarning } from "./warnings";

export function initChart(chart, element) {
  // set the bounds
  chart.width(getAvailableCanvasWidth(element));
  chart.height(getAvailableCanvasHeight(element));
  // disable animations
  chart.transitionDuration(0);
  // disable brush
  if (chart.brushOn) {
    chart.brushOn(false);
  }
}

export function makeIndexMap(values: Array<Value>): Map<Value, number> {
  const indexMap = new Map();
  for (const [index, key] of values.entries()) {
    indexMap.set(key, index);
  }
  return indexMap;
}

type CrossfilterGroup = {
  top: (n: number) => { key: any, value: any },
  all: () => { key: any, value: any },
};

// HACK: This ensures each group is sorted by the same order as xValues,
// otherwise we can end up with line charts with x-axis labels in the correct order
// but the points in the wrong order. There may be a more efficient way to do this.
export function forceSortedGroup(
  group: CrossfilterGroup,
  indexMap: Map<Value, number>,
): void {
  // $FlowFixMe
  const sorted = group
    .top(Infinity)
    .sort((a, b) => indexMap.get(a.key) - indexMap.get(b.key));
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].index = i;
  }
  group.all = () => sorted;
}

export function forceSortedGroupsOfGroups(
  groupsOfGroups: CrossfilterGroup[][],
  indexMap: Map<Value, number>,
): void {
  for (const groups of groupsOfGroups) {
    for (const group of groups) {
      forceSortedGroup(group, indexMap);
    }
  }
}

/*
 * The following functions are actually just used by LineAreaBarRenderer but moved here in interest of making that namespace more concise
 */

export function reduceGroup(group, key, warnUnaggregated) {
  return group.reduce(
    (acc, d) => {
      if (acc == null && d[key] == null) {
        return null;
      } else {
        if (acc != null && d[key] != null) {
          warnUnaggregated();
        }
        return (acc || 0) + (d[key] || 0);
      }
    },
    (acc, d) => {
      if (acc == null && d[key] == null) {
        return null;
      } else {
        if (acc != null && d[key] != null) {
          warnUnaggregated();
        }
        return (acc || 0) - (d[key] || 0);
      }
    },
    () => null,
  );
}

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
    const parsedValue = isNumeric ? xValue : String(formatNull(xValue));
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

export function getDatas({ settings, series }, warn) {
  const isNotOrdinal = !isOrdinal(settings);
  return series.map(({ data }) => {
    // non-ordinal dimensions can't display null values,
    // so we filter them out and display a warning
    const rows = isNotOrdinal
      ? data.rows.filter(([x]) => x !== null)
      : data.rows;
    if (rows.length < data.rows.length) {
      warn(nullDimensionWarning());
    }

    const parseOptions = getParseOptions({ settings, data });
    return rows.map(row => {
      const [x, ...rest] = row;
      const newRow = [parseXValue(x, parseOptions, warn), ...rest];
      newRow._origin = row._origin;
      return newRow;
    });
  });
}

export function getXValues({ settings, series }) {
  // if _raw isn't set then we already have the raw series
  const { _raw: rawSeries = series } = series;
  const isNotOrdinal = !isOrdinal(settings);
  const warn = () => {}; // no op since warning in handled by getDatas
  const uniqueValues = new Set();
  let isAscending = true;
  let isDescending = true;
  for (const { data } of rawSeries) {
    // In the raw series, the dimension isn't necessarily in the first element
    // of each row. This finds the correct column index.
    const columnIndex = getColumnIndex({ settings, data });

    const parseOptions = getParseOptions({ settings, data });
    let lastValue;
    for (const row of data.rows) {
      // non ordinal dimensions can't display null values, so we exclude them from xValues
      if (isNotOrdinal && row[columnIndex] === null) {
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
  !isTimeseries(settings) && !isHistogram(settings);

// bar histograms have special tick formatting:
// * aligned with beginning of bar to show bin boundaries
// * label only shows beginning value of bin
// * includes an extra tick at the end for the end of the last bin
export const isHistogramBar = ({ settings, chartType }) =>
  isHistogram(settings) && chartType === "bar";

export const isStacked = (settings, datas) => settings["stackable.stack_type"];
export const isNormalized = (settings, datas) =>
  settings["stackable.stack_type"] === "normalized";

// find the first nonempty single series
export const getFirstNonEmptySeries = series =>
  _.find(series, s => !datasetContainsNoResults(s.data));
export const isDimensionTimeseries = series =>
  dimensionIsTimeseries(getFirstNonEmptySeries(series).data);

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

// is this a dashboard multiseries?
// TODO: better way to detect this?
export const isMultiCardSeries = series =>
  series.length > 1 &&
  getIn(series, [0, "card", "id"]) !== getIn(series, [1, "card", "id"]);

const NULL_DISPLAY_VALUE = t`(empty)`;
export function formatNull(value) {
  return value === null ? NULL_DISPLAY_VALUE : value;
}
