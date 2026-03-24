// NOTE: this file is used on the frontend and backend and there are some
// limitations. See frontend/src/metabase-shared/color_selector for details

import Color from "color";

import { isNumber } from "metabase/lib/types";
import { alpha } from "metabase/ui/colors";
import { getLinearColorScale, getSafeColor } from "metabase/ui/colors/scales";
import type {
  ColumnFormattingOperator,
  ColumnFormattingSetting,
  DatasetColumn,
  RowValue,
  RowValues,
} from "metabase-types/api";

import type { Extent, Formatter } from "../types";

type Formatters = Record<string, Formatter[]>;

type RowFormatter = (
  row: RowValues,
  colIndexes: ColumnIndexes,
) => string | null;

type FormatterFactory = (value: RowValue, color: string) => Formatter;

type ColumnIndexes = Record<string, number>;

type ColumnExtents = Record<string, Extent>;

const CELL_ALPHA = 0.65;
const ROW_ALPHA = 0.2;
const GRADIENT_ALPHA = 0.75;
const MIN_ALPHA = 0.000001; // 1e-6, just above scientific notation threshold

// for simplicity when typing assume all values are numbers, since you can only pick numeric columns

export function makeCellBackgroundGetter(
  rows: RowValues[],
  cols: DatasetColumn[],
  formattingSettings: ColumnFormattingSetting[],
  isPivoted: boolean,
) {
  let formatters: Formatters = {};
  let rowFormatters: RowFormatter[] = [];
  const colIndexes = getColumnIndexesByName(cols);
  try {
    const columnExtents = computeColumnExtents(
      formattingSettings,
      rows,
      colIndexes,
    );
    formatters = compileFormatters(formattingSettings, columnExtents);
    rowFormatters = compileRowFormatters(formattingSettings);
  } catch (e) {
    console.error("Unexpected error compiling column formatters: ", e);
  }
  if (Object.keys(formatters).length === 0 && rowFormatters.length === 0) {
    return () => null;
  } else {
    return function (value: RowValue, rowIndex: number, colName: string) {
      if (formatters[colName]) {
        for (let i = 0; i < formatters[colName].length; i++) {
          const formatter = formatters[colName][i];
          const color = formatter(value);
          if (color != null) {
            return color;
          }
        }
      }
      // don't highlight row for pivoted tables
      if (!isPivoted) {
        for (let i = 0; i < rowFormatters.length; i++) {
          const rowFormatter = rowFormatters[i];
          const color = rowFormatter(rows[rowIndex], colIndexes);
          if (color != null) {
            return color;
          }
        }
      }
      return null;
    };
  }
}

function getColumnIndexesByName(cols: DatasetColumn[]): ColumnIndexes {
  const colIndexes: Record<string, number> = {};
  for (let i = 0; i < cols.length; i++) {
    colIndexes[cols[i].name] = i;
  }
  return colIndexes;
}

export const isNonEmptyString = (
  value: RowValue | undefined,
): value is string => typeof value === "string" && value.length > 0;

export const isEmptyString = (value: RowValue | undefined): value is string =>
  typeof value === "string" && value.length === 0;

export const OPERATOR_FORMATTER_FACTORIES: Record<
  ColumnFormattingOperator,
  FormatterFactory
> = {
  "<": (value, color) => (v) =>
    isNumber(value) && isNumber(v) && v < value ? color : null,
  "<=": (value, color) => (v) =>
    isNumber(value) && isNumber(v) && v <= value ? color : null,
  ">=": (value, color) => (v) =>
    isNumber(value) && isNumber(v) && v >= value ? color : null,
  ">": (value, color) => (v) =>
    isNumber(value) && isNumber(v) && v > value ? color : null,
  "=": (value, color) => (v) => (v === value ? color : null),
  "!=": (value, color) => (v) =>
    !isEmptyString(value) && v !== value ? color : null,
  "is-null": (_value, color) => (v) => (v === null ? color : null),
  "not-null": (_value, color) => (v) => (v !== null ? color : null),
  contains: (value, color) => (v) =>
    isNonEmptyString(value) && isNonEmptyString(v) && v.indexOf(value) >= 0
      ? color
      : null,
  "does-not-contain": (value, color) => (v) =>
    isNonEmptyString(value) && isNonEmptyString(v) && v.indexOf(value) < 0
      ? color
      : null,
  "starts-with": (value, color) => (v) =>
    isNonEmptyString(value) && isNonEmptyString(v) && v.startsWith(value)
      ? color
      : null,
  "ends-with": (value, color) => (v) =>
    isNonEmptyString(value) && isNonEmptyString(v) && v.endsWith(value)
      ? color
      : null,
  "is-true": (_value, color) => (v) => (v ? color : null),
  "is-false": (_value, color) => (v) => (v ? null : color),
};

export function compileFormatter(
  format: ColumnFormattingSetting,
  columnName: string | null = null,
  columnExtents: ColumnExtents | null = null,
  isRowFormatter: boolean = false,
): Formatter {
  if (format.type === "single") {
    let { operator, value, color } = format;
    color = alpha(color, isRowFormatter ? ROW_ALPHA : CELL_ALPHA);

    const formatterFactory = OPERATOR_FORMATTER_FACTORIES[operator];
    if (formatterFactory) {
      return formatterFactory(value, color);
    }

    console.error("Unsupported formatting operator:", operator);
    return () => null;
  } else if (format.type === "range") {
    const columnMin = (name: string | null): number | undefined =>
      typeof name === "string" ? columnExtents?.[name]?.[0] : undefined;
    const columnMax = (name: string | null): number | undefined =>
      typeof name === "string" ? columnExtents?.[name]?.[1] : undefined;

    const min =
      format.min_type === "custom"
        ? parseFloat(String(format.min_value))
        : format.min_type === "all"
          ? Math.min(
              ...format.columns
                .map(columnMin)
                .filter((value) => typeof value === "number"),
            )
          : columnMin(columnName);
    const max =
      format.max_type === "custom"
        ? parseFloat(String(format.max_value))
        : format.max_type === "all"
          ? Math.max(
              ...format.columns
                .map(columnMax)
                .filter((value) => typeof value === "number"),
            )
          : columnMax(columnName);

    if (typeof max !== "number" || typeof min !== "number") {
      console.warn("Invalid range min/max", min, max);
      return () => null;
    }

    const scale = getLinearColorScale(
      [min, max],
      format.colors.map((c) => {
        const color = Color(c);
        const alpha = color.alpha();
        return color.alpha(clampAlpha(alpha)).toString();
      }),
    ).clamp(true);
    return (value) => {
      if (!isNumber(value)) {
        return null;
      }
      const colorValue = scale(value);
      if (!colorValue) {
        return null;
      }
      return getSafeColor(colorValue);
    };
  } else {
    // @ts-expect-error this branch should never happen
    console.warn("Unknown format type", format.type);
    return () => null;
  }
}

/**
 * Clamps the alpha value to prevent values very close to 0 from being converted to scientific notation.
 *
 * @param {number} alpha - The alpha value to clamp
 * @returns {number} The clamped alpha value. Returns 0 if input is 0, otherwise clamps between MIN_ALPHA (0.000001) and GRADIENT_ALPHA (0.75)
 */
function clampAlpha(alpha: number): number {
  if (alpha === 0) {
    return 0;
  }

  return Math.min(GRADIENT_ALPHA, Math.max(MIN_ALPHA, alpha));
}

// NOTE: implement `extent` like this rather than using d3.extent since rows may
// be a Java `List` rather than a JavaScript Array when used in Pulse formatting
export function extent(
  rows: (RowValue | undefined)[][],
  colIndex: number,
): Extent {
  let min = Infinity;
  let max = -Infinity;
  const length = rows.length;
  for (let i = 0; i < length; i++) {
    const value = rows[i][colIndex];
    if (typeof value === "number" && value < min) {
      min = value;
    }
    if (typeof value === "number" && value > max) {
      max = value;
    }
  }
  return [min, max];
}

function computeColumnExtents(
  formats: ColumnFormattingSetting[],
  rows: RowValues[],
  colIndexes: ColumnIndexes,
): ColumnExtents {
  const columnExtents: ColumnExtents = {};
  formats.forEach((format) => {
    format.columns.forEach((columnName) => {
      if (!columnExtents[columnName]) {
        const colIndex = colIndexes[columnName];
        columnExtents[columnName] = extent(rows, colIndex);
      }
    });
  });
  return columnExtents;
}

function compileFormatters(
  formats: ColumnFormattingSetting[],
  columnExtents: ColumnExtents,
): Formatters {
  const formatters: Formatters = {};
  formats.forEach((format) => {
    format.columns.forEach((columnName) => {
      formatters[columnName] = formatters[columnName] || [];
      formatters[columnName].push(
        compileFormatter(format, columnName, columnExtents, false),
      );
    });
  });
  return formatters;
}

function compileRowFormatters(
  formats: ColumnFormattingSetting[],
): RowFormatter[] {
  const rowFormatters: RowFormatter[] = [];
  formats
    .filter((format) => format.type === "single" && format.highlight_row)
    .forEach((format) => {
      const formatter = compileFormatter(format, null, null, true);
      if (formatter) {
        format.columns.forEach((columnName) => {
          rowFormatters.push((row, colIndexes) =>
            formatter(row[colIndexes[columnName]]),
          );
        });
      }
    });
  return rowFormatters;
}
