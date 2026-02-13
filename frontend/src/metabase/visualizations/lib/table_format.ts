// NOTE: this file is used on the frontend and backend and there are some
// limitations. See frontend/src/metabase-shared/color_selector for details

import Color from "color";

import { alpha } from "metabase/lib/colors";
import { getColorScale, getSafeColor } from "metabase/lib/colors/scales";

const CELL_ALPHA = 0.65;
const ROW_ALPHA = 0.2;
const GRADIENT_ALPHA = 0.75;
const MIN_ALPHA = 0.000001; // 1e-6, just above scientific notation threshold

// for simplicity when typing assume all values are numbers, since you can only pick numeric columns

export interface SingleFormat {
  type: "single";
  operator: string;
  value?: number | string | null;
  color: string;
  highlight_row?: boolean;
  columns: string[];
}

export interface RangeFormat {
  type: "range";
  columns: string[];
  colors: string[];
  min_type: string;
  max_type: string;
  min_value?: string;
  max_value?: string;
}

export type TableFormat = SingleFormat | RangeFormat;

export type ColumnExtents = Record<string, [number, number]>;

export type CellBackgroundGetter = (
  value: unknown,
  rowIndex: number,
  colName: string,
) => string | null;

export function makeCellBackgroundGetter(
  rows: unknown[][],
  cols: { name: string }[],
  formattingSettings: TableFormat[],
  isPivoted: boolean,
): CellBackgroundGetter {
  let formatters: Record<string, ((v: unknown) => string | null)[]> = {};
  let rowFormatters: ((row: unknown[], colIndexes: Record<string, number>) => string | null)[] = [];
  const colIndexes = getColumnIndexesByName(cols);
  try {
    const columnExtents = computeColumnExtents(
      formattingSettings,
      rows,
      colIndexes,
    );
    formatters = compileFormatters(formattingSettings, columnExtents);
    rowFormatters = compileRowFormatters(formattingSettings, columnExtents);
  } catch (e) {
    console.error("Unexpected error compiling column formatters: ", e);
  }
  if (Object.keys(formatters).length === 0 && rowFormatters.length === 0) {
    return () => null;
  } else {
    return function (value: unknown, rowIndex: number, colName: string) {
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

function getColumnIndexesByName(cols: { name: string }[]): Record<string, number> {
  const colIndexes: Record<string, number> = {};
  for (let i = 0; i < cols.length; i++) {
    colIndexes[cols[i].name] = i;
  }
  return colIndexes;
}

export const canCompareSubstrings = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" && !!a.length && !!b.length;

export const isEmptyString = (val: unknown): boolean =>
  typeof val === "string" && !val.length;

export const OPERATOR_FORMATTER_FACTORIES: Record<
  string,
  (value: unknown, color: string) => (v: unknown) => string | null
> = {
  "<": (value, color) => (v) =>
    typeof value === "number" && typeof v === "number" && v < value
      ? color
      : null,
  "<=": (value, color) => (v) =>
    typeof value === "number" && typeof v === "number" && v <= value
      ? color
      : null,
  ">=": (value, color) => (v) =>
    typeof value === "number" && typeof v === "number" && v >= value
      ? color
      : null,
  ">": (value, color) => (v) =>
    typeof value === "number" && typeof v === "number" && v > value
      ? color
      : null,
  "=": (value, color) => (v) => (v === value ? color : null),
  "!=": (value, color) => (v) =>
    !isEmptyString(value) && v !== value ? color : null,
  "is-null": (_value, color) => (v) => (v === null ? color : null),
  "not-null": (_value, color) => (v) => (v !== null ? color : null),
  contains: (value, color) => (v) =>
    canCompareSubstrings(value, v) && typeof v === "string" && v.indexOf(value as string) >= 0
      ? color
      : null,
  "does-not-contain": (value, color) => (v) =>
    canCompareSubstrings(value, v) && typeof v === "string" && v.indexOf(value as string) < 0
      ? color
      : null,
  "starts-with": (value, color) => (v) =>
    canCompareSubstrings(value, v) && typeof v === "string" && v.startsWith(value as string)
      ? color
      : null,
  "ends-with": (value, color) => (v) =>
    canCompareSubstrings(value, v) && typeof v === "string" && v.endsWith(value as string)
      ? color
      : null,
  "is-true": (_value, color) => (v) => (v ? color : null),
  "is-false": (_value, color) => (v) => (v ? null : color),
};

export function compileFormatter(
  format: TableFormat,
  columnName: string | null,
  columnExtents: ColumnExtents | null,
  isRowFormatter = false,
): (value: unknown) => string | null {
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
    const columnMin = (name: string) =>
      columnExtents && columnExtents[name] && columnExtents[name][0];
    const columnMax = (name: string) =>
      columnExtents && columnExtents[name] && columnExtents[name][1];

    const min =
      format.min_type === "custom"
        ? parseFloat(format.min_value ?? "")
        : format.min_type === "all"
          ? Math.min(...format.columns.map(columnMin).map((v) => v ?? Infinity))
          : columnMin(columnName ?? "");
    const max =
      format.max_type === "custom"
        ? parseFloat(format.max_value ?? "")
        : format.max_type === "all"
          ? Math.max(...format.columns.map(columnMax).map((v) => v ?? -Infinity))
          : columnMax(columnName ?? "");

    if (typeof max !== "number" || typeof min !== "number" || isNaN(min) || isNaN(max)) {
      console.warn("Invalid range min/max", min, max);
      return () => null;
    }

    const scale = getColorScale(
      [min, max],
      format.colors.map((c) => {
        const color = Color(c);
        const alphaVal = color.alpha();
        return color.alpha(clampAlpha(alphaVal)).toString();
      }),
    ).clamp(true);
    return (value: unknown) => {
      const colorValue = scale(value as number);
      if (!colorValue) {
        return null;
      }
      return getSafeColor(colorValue);
    };
  } else {
    console.warn("Unknown format type", (format as TableFormat).type);
    return () => null;
  }
}

/**
 * Clamps the alpha value to prevent values very close to 0 from being converted to scientific notation.
 */
function clampAlpha(alphaVal: number): number {
  if (alphaVal === 0) {
    return 0;
  }

  return Math.min(GRADIENT_ALPHA, Math.max(MIN_ALPHA, alphaVal));
}

// NOTE: implement `extent` like this rather than using d3.extent since rows may
// be a Java `List` rather than a JavaScript Array when used in Pulse formatting
export function extent(
  rows: unknown[][],
  colIndex: number,
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  const length = rows.length;
  for (let i = 0; i < length; i++) {
    const value = rows[i][colIndex];
    if (value != null && typeof value === "number" && value < min) {
      min = value;
    }
    if (value != null && typeof value === "number" && value > max) {
      max = value;
    }
  }
  return [min, max];
}

function computeColumnExtents(
  formats: TableFormat[],
  rows: unknown[][],
  colIndexes: Record<string, number>,
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
  formats: TableFormat[],
  columnExtents: ColumnExtents,
): Record<string, ((v: unknown) => string | null)[]> {
  const formatters: Record<string, ((v: unknown) => string | null)[]> = {};
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
  formats: TableFormat[],
): ((row: unknown[], colIndexes: Record<string, number>) => string | null)[] {
  const rowFormatters: ((row: unknown[], colIndexes: Record<string, number>) => string | null)[] = [];
  formats
    .filter(
      (format): format is SingleFormat =>
        format.type === "single" && !!format.highlight_row,
    )
    .forEach((format) => {
      const formatter = compileFormatter(format, null, null, true);
      if (formatter) {
        format.columns.forEach((columnName) => {
          rowFormatters.push((row: unknown[], colIndexes: Record<string, number>) =>
            formatter(row[colIndexes[columnName]]),
          );
        });
      }
    });
  return rowFormatters;
}
