/* @flow */

// NOTE: this file is used on the frontend and backend and there are some
// limitations. See frontend/src/metabase-shared/color_selector for details

import { alpha, getColorScale, roundColor } from "metabase/lib/colors";

const CELL_ALPHA = 0.65;
const ROW_ALPHA = 0.2;
const GRADIENT_ALPHA = 0.75;

import type { Column } from "metabase-types/types/Dataset";
// for simplicity wheb typing assume all values are numbers, since you can only pick numeric columns
type Value = number;
type Row = Value[];

type ColumnName = string;
type Color = string;

type Operator =
  | "<"
  | ">"
  | "<="
  | ">="
  | "="
  | "!="
  | "is-null"
  | "not-null"
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with";

type SingleFormat = {
  type: "single",
  columns: ColumnName[],
  color: Color,
  operator: Operator,
  value: number | string,
  highlight_row: boolean,
};

type RangeFormat = {
  type: "range",
  columns: ColumnName[],
  colors: Color[],
  min_type: null | "all" | "custom",
  min_value: number,
  max_type: null | "all" | "custom",
  max_value: number,
};

type Format = SingleFormat | RangeFormat;

type Settings = {
  "table.column_formatting": Format[],
  "table.pivot"?: boolean,
};

type Formatter = (value: number) => ?Color;
type RowFormatter = (row: number[], colIndexes: ColumnIndexes) => ?Color;

type FormatterFactory = (value: number | string, color: Color) => Formatter;

type BackgroundGetter = (
  value: number,
  rowIndex: number,
  colName: ColumnName,
) => ?Color;

type ColumnIndexes = {
  [key: ColumnName]: number,
};
type ColumnExtents = {
  [key: ColumnName]: [number, number],
};

export function makeCellBackgroundGetter(
  rows: Row[],
  cols: Column[],
  settings: Settings,
): BackgroundGetter {
  const formats = settings["table.column_formatting"] || [];
  const pivot = settings["table.pivot"];
  let formatters = {};
  let rowFormatters = [];
  const colIndexes = getColumnIndexesByName(cols);
  try {
    const columnExtents = computeColumnExtents(formats, rows, colIndexes);
    formatters = compileFormatters(formats, columnExtents);
    rowFormatters = compileRowFormatters(formats, columnExtents);
  } catch (e) {
    console.error("Unexpected error compiling column formatters: ", e);
  }
  if (Object.keys(formatters).length === 0 && rowFormatters.length === 0) {
    return () => null;
  } else {
    return function(value: Value, rowIndex: number, colName: ColumnName) {
      if (formatters[colName]) {
        // const value = rows[rowIndex][colIndexes[colName]];
        for (let i = 0; i < formatters[colName].length; i++) {
          const formatter = formatters[colName][i];
          const color = formatter(value);
          if (color != null) {
            return color;
          }
        }
      }
      // don't highlight row for pivoted tables
      if (!pivot) {
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

function getColumnIndexesByName(cols) {
  const colIndexes = {};
  for (let i = 0; i < cols.length; i++) {
    colIndexes[cols[i].name] = i;
  }
  return colIndexes;
}

export const OPERATOR_FORMATTER_FACTORIES: {
  [Operator]: FormatterFactory,
} = {
  "<": (value, color) => v =>
    typeof value === "number" && v < value ? color : null,
  "<=": (value, color) => v =>
    typeof value === "number" && v <= value ? color : null,
  ">=": (value, color) => v =>
    typeof value === "number" && v >= value ? color : null,
  ">": (value, color) => v =>
    typeof value === "number" && v > value ? color : null,
  "=": (value, color) => v => (v === value ? color : null),
  "!=": (value, color) => v => (v !== value ? color : null),
  "is-null": (_value, color) => v => (v === null ? color : null),
  "not-null": (_value, color) => v => (v !== null ? color : null),
  contains: (value, color) => v =>
    typeof value === "string" && typeof v === "string" && v.indexOf(value) >= 0
      ? color
      : null,
  "does-not-contain": (value, color) => v =>
    typeof value === "string" && typeof v === "string" && v.indexOf(value) < 0
      ? color
      : null,
  "starts-with": (value, color) => v =>
    typeof value === "string" && typeof v === "string" && v.startsWith(value)
      ? color
      : null,
  "ends-with": (value, color) => v =>
    typeof value === "string" && typeof v === "string" && v.endsWith(value)
      ? color
      : null,
};

export function compileFormatter(
  format: Format,
  columnName: ?ColumnName,
  columnExtents: ?ColumnExtents,
  isRowFormatter: boolean = false,
): ?Formatter {
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
    const columnMin = name =>
      // $FlowFixMe
      columnExtents && columnExtents[name] && columnExtents[name][0];
    const columnMax = name =>
      // $FlowFixMe
      columnExtents && columnExtents[name] && columnExtents[name][1];

    const min =
      format.min_type === "custom"
        ? parseFloat(format.min_value)
        : format.min_type === "all"
        ? // $FlowFixMe
          Math.min(...format.columns.map(columnMin))
        : columnMin(columnName);
    const max =
      format.max_type === "custom"
        ? parseFloat(format.max_value)
        : format.max_type === "all"
        ? // $FlowFixMe
          Math.max(...format.columns.map(columnMax))
        : columnMax(columnName);

    if (typeof max !== "number" || typeof min !== "number") {
      console.warn("Invalid range min/max", min, max);
      return () => null;
    }

    const scale = getColorScale(
      [min, max],
      format.colors.map(c => alpha(c, GRADIENT_ALPHA)),
    ).clamp(true);
    return value => roundColor(scale(value));
  } else {
    console.warn("Unknown format type", format.type);
    return () => null;
  }
}

// NOTE: implement `extent` like this rather than using d3.extent since rows may
// be a Java `List` rather than a JavaScript Array when used in Pulse formatting
function extent(rows: Row[], colIndex: number) {
  let min = Infinity;
  let max = -Infinity;
  const length = rows.length;
  for (let i = 0; i < length; i++) {
    const value = rows[i][colIndex];
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return [min, max];
}

function computeColumnExtents(formats, rows, colIndexes) {
  const columnExtents = {};
  formats.forEach(format => {
    format.columns.forEach(columnName => {
      if (!columnExtents[columnName]) {
        const colIndex = colIndexes[columnName];
        columnExtents[columnName] = extent(rows, colIndex);
      }
    });
  });
  return columnExtents;
}

function compileFormatters(formats: Format[], columnExtents: ColumnExtents) {
  const formatters = {};
  formats.forEach(format => {
    format.columns.forEach(columnName => {
      formatters[columnName] = formatters[columnName] || [];
      formatters[columnName].push(
        compileFormatter(format, columnName, columnExtents, false),
      );
    });
  });
  return formatters;
}

function compileRowFormatters(formats: Format[]): RowFormatter[] {
  const rowFormatters = [];
  formats
    .filter(format => format.type === "single" && format.highlight_row)
    .forEach(format => {
      const formatter = compileFormatter(format, null, null, true);
      if (formatter) {
        format.columns.forEach(columnName => {
          rowFormatters.push((row, colIndexes) =>
            formatter(row[colIndexes[columnName]]),
          );
        });
      }
    });
  return rowFormatters;
}
