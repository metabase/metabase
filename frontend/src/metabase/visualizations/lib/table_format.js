/* @flow */

// NOTE: this file is used on the frontend and backend and there are some
// limitations. See frontend/src/metabase-shared/color_selector for details

import { alpha, getColorScale } from "metabase/lib/colors";

const CELL_ALPHA = 0.65;
const ROW_ALPHA = 0.2;
const GRADIENT_ALPHA = 0.75;

import type { Column } from "metabase/meta/types/Dataset";
// for simplicity wheb typing assume all values are numbers, since you can only pick numeric columns
type Value = number;
type Row = Value[];

type ColumnName = string;
type Color = string;

type SingleFormat = {
  type: "single",
  columns: ColumnName[],
  color: Color,
  operator: "<" | ">" | "<=" | ">=" | "=" | "!=",
  value: number,
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
  const formats = settings["table.column_formatting"];
  const pivot = settings["table.pivot"];
  let formatters = {};
  let rowFormatters = [];
  const colIndexes = getColumnIndexesByName(cols);
  try {
    const columnExtents = computeColumnExtents(formats, rows, colIndexes);
    formatters = compileFormatters(formats, columnExtents);
    rowFormatters = compileRowFormatters(formats, columnExtents);
  } catch (e) {
    console.error(e);
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

function compileFormatter(
  format,
  columnName,
  columnExtents,
  isRowFormatter = false,
): ?Formatter {
  if (format.type === "single") {
    let { operator, value, color } = format;
    if (isRowFormatter) {
      color = alpha(color, ROW_ALPHA);
    } else {
      color = alpha(color, CELL_ALPHA);
    }
    switch (operator) {
      case "<":
        return v => (v < value ? color : null);
      case "<=":
        return v => (v <= value ? color : null);
      case ">=":
        return v => (v >= value ? color : null);
      case ">":
        return v => (v > value ? color : null);
      case "=":
        return v => (v === value ? color : null);
      case "!=":
        return v => (v !== value ? color : null);
    }
  } else if (format.type === "range") {
    const columnMin = name =>
      // $FlowFixMe
      columnExtents && columnExtents[name] && columnExtents[name][0];
    const columnMax = name =>
      // $FlowFixMe
      columnExtents && columnExtents[name] && columnExtents[name][1];

    const min =
      format.min_type === "custom"
        ? format.min_value
        : format.min_type === "all"
          ? // $FlowFixMe
            Math.min(...format.columns.map(columnMin))
          : columnMin(columnName);
    const max =
      format.max_type === "custom"
        ? format.max_value
        : format.max_type === "all"
          ? // $FlowFixMe
            Math.max(...format.columns.map(columnMax))
          : columnMax(columnName);

    if (typeof max !== "number" || typeof min !== "number") {
      console.warn("Invalid range min/max", min, max);
      return () => null;
    }

    return getColorScale(
      [min, max],
      format.colors.map(c => alpha(c, GRADIENT_ALPHA)),
    ).clamp(true);
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
