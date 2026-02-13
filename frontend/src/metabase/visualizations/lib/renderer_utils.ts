import { getIn } from "icepick";
import _ from "underscore";

import { formatNullable } from "metabase/lib/formatting/nullable";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";

import { dimensionIsNumeric } from "./numeric";
import { dimensionIsExplicitTimeseries } from "./timeseries";
import type { VisualizationWarning } from "./warnings";
import { invalidDateWarning, nullDimensionWarning } from "./warnings";

interface ParseOptions {
  isNumeric: boolean;
  isTimeseries: boolean;
  isQuantitative: boolean;
  unit?: string;
}

export function parseXValue(
  xValue: unknown,
  options: ParseOptions,
  warn: (warning: VisualizationWarning) => void,
): string | number | null | { format: (fmt?: string) => string; isValid: () => boolean; toString: () => string; _i: unknown } {
  const { parsedValue, warning } = memoizedParseXValue(xValue, options);
  if (warning !== undefined) {
    warn(warning);
  }
  return parsedValue;
}

const memoizedParseXValue = _.memoize(
  (
    xValue: unknown,
    { isNumeric, isTimeseries, isQuantitative, unit }: ParseOptions,
  ): { parsedValue: unknown; warning?: VisualizationWarning } => {
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
  (x: unknown, options: ParseOptions) =>
    [x, typeof x, ...Object.values(options)].join(),
);

function getParseOptions({
  settings,
  data,
}: {
  settings: Record<string, unknown>;
  data: { cols: { name?: string; unit?: string }[]; rows: unknown[][] };
}): ParseOptions {
  const columnIndex = getColumnIndex({ settings, data });
  return {
    isNumeric: dimensionIsNumeric(data, columnIndex),
    isTimeseries:
      isTimeseries(settings) ||
      dimensionIsExplicitTimeseries(data, columnIndex),
    isQuantitative: isQuantitative(settings),
    unit: data.cols[columnIndex]?.unit,
  };
}

function canDisplayNull(settings: Record<string, unknown>): boolean {
  return !isOrdinal(settings) || isHistogram(settings);
}

interface GetXValuesParams {
  settings: Record<string, unknown>;
  series: { data: { cols: { name?: string }[]; rows: unknown[][] } }[] & {
    _raw?: { data: { cols: { name?: string }[]; rows: unknown[][] } }[];
  };
}

export function getXValues({
  settings,
  series,
}: GetXValuesParams): (string | number | { format: (fmt?: string) => string })[] {
  // if _raw isn't set then we already have the raw series
  const { _raw: rawSeries = series } = series;
  const warn = () => {}; // no op since warning in handled by getDatas
  const uniqueValues = new Set<string | number | { format: (fmt?: string) => string }>();
  let isAscending = true;
  let isDescending = true;
  for (const { data } of rawSeries) {
    const columnIndex = getColumnIndex({ settings, data });
    if (!data.cols[columnIndex]) {
      continue;
    }

    const parseOptions = getParseOptions({ settings, data });
    let lastValue: string | number | undefined;
    for (const row of data.rows) {
      if (canDisplayNull(settings) && row[columnIndex] === null) {
        continue;
      }
      const value = parseXValue(row[columnIndex], parseOptions, warn);
      if (lastValue !== undefined && value != null) {
        // Comparison works for numbers, strings, and dayjs (valueOf)
        isAscending = isAscending && (lastValue as unknown as number) <= (value as unknown as number);
        isDescending = isDescending && (value as unknown as number) <= (lastValue as unknown as number);
      }
      lastValue = value as string | number | undefined;
      if (value != null) {
        uniqueValues.add(value as string | number | { format: (fmt?: string) => string });
      }
    }
  }
  let xValues = Array.from(uniqueValues);
  if (isDescending) {
    xValues = _.sortBy(xValues, (x) => x).reverse();
  } else if (isAscending) {
    xValues = _.sortBy(xValues, (x) => x);
  }
  return xValues;
}

function getColumnIndex({
  settings,
  data: { cols },
}: {
  settings: Record<string, unknown>;
  data: { cols: { name?: string }[] };
}): number {
  const [dim] = (settings["graph.dimensions"] as string[] | undefined) || [];
  const i = cols.findIndex((c) => c.name === dim);
  return i === -1 ? 0 : i;
}

// Crossfilter calls toString on each moment object, which calls format(), which is very slow.
function moment_fast_toString(this: { _i: unknown }) {
  return this._i;
}

function parseTimestampAndWarn(
  value: unknown,
  unit?: string,
): { parsedValue: null; warning: VisualizationWarning } | { parsedValue: ReturnType<typeof parseTimestamp>; warning?: undefined } {
  if (value == null) {
    return { parsedValue: null, warning: nullDimensionWarning() };
  }
  const m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return { parsedValue: null, warning: invalidDateWarning(value) };
  }
  (m as { toString: () => unknown }).toString = moment_fast_toString;
  return { parsedValue: m };
}

/************************************************************ PROPERTIES ************************************************************/

export const isTimeseries = (settings: Record<string, unknown>) =>
  settings["graph.x_axis.scale"] === "timeseries";
export const isQuantitative = (settings: Record<string, unknown>) =>
  ["linear", "log", "pow"].indexOf(settings["graph.x_axis.scale"] as string) >= 0;
export const isHistogram = (settings: Record<string, unknown>) =>
  settings["graph.x_axis._scale_original"] === "histogram" ||
  settings["graph.x_axis.scale"] === "histogram";
export const isOrdinal = (settings: Record<string, unknown>) =>
  settings["graph.x_axis.scale"] === "ordinal";

export const isStacked = (settings: Record<string, unknown>) =>
  settings["stackable.stack_type"];
export const isNormalized = (
  settings: Record<string, unknown>,
) =>
  settings["stackable.stack_type"] === "normalized";

// find the first nonempty single series
export const getFirstNonEmptySeries = (series: { data: unknown }[]) =>
  _.find(series, (s) => !datasetContainsNoResults(s.data));

function hasRemappingAndValuesAreStrings(
  { cols }: { cols: { remapping?: Map<unknown, unknown> }[] },
  i = 0,
): boolean {
  const column = cols[i];

  if (column.remapping && column.remapping.size > 0) {
    return typeof column.remapping.values().next().value === "string";
  } else {
    return false;
  }
}

export const isRemappedToString = (series: { data: { cols: { remapping?: Map<unknown, unknown> }[] } }[]) =>
  hasRemappingAndValuesAreStrings(getFirstNonEmptySeries(series)!.data);

export const hasClickBehavior = (series: { card?: { visualization_settings?: { click_behavior?: unknown } } }[]) =>
  getIn(series, [0, "card", "visualization_settings", "click_behavior"]) != null;
