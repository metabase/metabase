/// Utility functions used by both the LineAreaBar renderer and the RowRenderer

import _ from "underscore";
import { getIn } from "icepick";

import { datasetContainsNoResults } from "metabase/lib/dataset";
import { parseTimestamp } from "metabase/lib/time";
import {
  NULL_DISPLAY_VALUE,
  NULL_NUMERIC_VALUE,
  TOTAL_ORDINAL_VALUE,
} from "metabase/lib/constants";

import {
  computeTimeseriesDataInverval,
  dimensionIsTimeseries,
  dimensionIsExplicitTimeseries,
  getTimezone,
  minTimeseriesUnit,
} from "./timeseries";
import { computeNumericDataInverval, dimensionIsNumeric } from "./numeric";

import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";
import { invalidDateWarning, nullDimensionWarning } from "./warnings";

import type { Value } from "metabase-types/types/Dataset";

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

function canDisplayNull(settings) {
  // histograms are converted to ordinal scales, so we need this ugly logic as a workaround
  return !isOrdinal(settings) || isHistogram(settings);
}

export function getDatas({ settings, series }, warn) {
  return series.map(({ data }) => {
    const parseOptions = getParseOptions({ settings, data });

    let rows = data.rows;

    // non-ordinal dimensions can't display null values,
    // so we filter them out and display a warning
    if (canDisplayNull(settings)) {
      rows = data.rows.filter(([x]) => x !== null);
    } else if (parseOptions.isNumeric) {
      rows = data.rows.map(row => {
        const [x, ...rest] = row;
        const newRow = [replaceNullValuesForOrdinal(x), ...rest];
        newRow._origin = row._origin;
        return newRow;
      });
    }

    if (rows.length < data.rows.length) {
      warn(nullDimensionWarning());
    }

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

/*

A waterfall chart is essentially a stacked bar chart.
It consists of the following (from the topmost):
- the "total bar" which has a value only for the last one
- the "green bar" for the positives/increases
- the "red bar" for the negatives/decreases
- the "invisible beam" supporting either the green or red bar

Note the green and red bars are mutually exclusive (i.e. if one has
a positive value, the other is zero). This is done so we need not have
conditional fill color.

*/

export function syntheticStackedBarsForWaterfallChart(
  datas,
  settings = {},
  series = [],
) {
  const showTotal = settings && settings["waterfall.show_total"];
  const stackedBarsDatas = datas.slice();
  const mainSeries = stackedBarsDatas[0];
  const mainValues = mainSeries.map(d => d[1]);
  const totalValue = mainValues.reduce((total, value) => total + value, 0);

  const { beams } = mainValues.reduce(
    (t, value) => {
      return {
        beams: [...t.beams, t.offset],
        offset: t.offset + value,
      };
    },
    { beams: [], offset: 0 },
  );

  const values = mainValues.slice();
  if (showTotal) {
    const total = [xValueForWaterfallTotal({ settings, series }), totalValue];
    if (mainSeries[0]._origin) {
      // cloning for the total bar
      total._origin = {
        seriesIndex: mainSeries[0]._origin.seriesIndex,
        rowIndex: mainSeries.length,
        cols: mainSeries[0]._origin.cols,
        row: total,
      };
    }
    stackedBarsDatas[0] = [...mainSeries, total];
    // The last one is the total bar, anchor it at 0
    beams.push(0);
    values.push(0);
  } else {
    stackedBarsDatas[0] = mainSeries;
  }
  stackedBarsDatas.push(stackedBarsDatas[0].map(k => k.slice())); // negatives
  stackedBarsDatas.push(stackedBarsDatas[0].map(k => k.slice())); // positives
  stackedBarsDatas.push(stackedBarsDatas[0].map(k => k.slice())); // total
  for (let k = 0; k < values.length; ++k) {
    stackedBarsDatas[0][k]._waterfallValue = stackedBarsDatas[0][k][1];
    stackedBarsDatas[0][k][1] = beams[k];
    stackedBarsDatas[1][k][1] = values[k] < 0 ? values[k] : 0;
    stackedBarsDatas[2][k][1] = values[k] > 0 ? values[k] : 0;
    stackedBarsDatas[3][k][1] =
      !showTotal || k < values.length - 1 ? 0 : totalValue;
  }

  return stackedBarsDatas;
}

export function getXInterval({ settings, series }, xValues, warn) {
  if (isTimeseries(settings)) {
    // We need three pieces of information to define a timeseries range:
    // 1. interval - it's really the "unit": month, day, etc
    // 2. count - how many intervals per tick?
    // 3. timezone - what timezone are values in? days vary in length by timezone
    const unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));
    const timezone = getTimezone(series, warn);
    const { count, interval } = computeTimeseriesDataInverval(xValues, unit);
    return { count, interval, timezone };
  } else if (isQuantitative(settings) || isHistogram(settings)) {
    // Get the bin width from binning_info, if available
    // TODO: multiseries?
    const binningInfo = getFirstNonEmptySeries(series).data.cols[0]
      .binning_info;
    if (binningInfo) {
      return binningInfo.bin_width;
    }

    // Otherwise try to infer from the X values
    return computeNumericDataInverval(xValues);
  }
}

export function xValueForWaterfallTotal({ settings, series }) {
  const xValues = getXValues({ settings, series });
  const xInterval = getXInterval({ settings, series }, xValues, () => {});

  if (isTimeseries(settings)) {
    const { count, interval } = xInterval;
    const lastXValue = xValues[xValues.length - 1];
    return lastXValue.clone().add(count, interval);
  } else if (isQuantitative(settings) || isHistogram(settings)) {
    const maxXValue = _.max(xValues);
    return maxXValue + xInterval;
  }

  return TOTAL_ORDINAL_VALUE;
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
export const isLine = settings => settings.display === "line";
export const isArea = settings => settings.display === "area";

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

export const hasClickBehavior = series =>
  getIn(series, [0, "card", "visualization_settings", "click_behavior"]) !=
  null;

// is this a dashboard multiseries?
// TODO: better way to detect this?
export const isMultiCardSeries = series =>
  series.length > 1 &&
  getIn(series, [0, "card", "id"]) !== getIn(series, [1, "card", "id"]);

export function formatNull(value) {
  return value === null ? NULL_DISPLAY_VALUE : value;
}

// Hack: for numeric dimensions we have to replace null values
// with anything else since crossfilter groups merge 0 and null
export function replaceNullValuesForOrdinal(value) {
  return value === null ? NULL_NUMERIC_VALUE : value;
}
