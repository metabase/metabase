import { alpha, getColorScale } from "metabase/lib/colors";
import _ from "underscore";
import d3 from "d3";

const CELL_ALPHA = 0.65;
const ROW_ALPHA = 0.2;
const GRADIENT_ALPHA = 0.75;

export function makeCellBackgroundGetter(data, settings) {
  const { rows, cols } = data;
  const formats = settings["table.column_formatting"];
  const pivot = settings["table.pivot"];
  let formatters = {};
  let rowFormatters = [];
  try {
    const columnExtents = computeColumnExtents(formats, data);
    formatters = compileFormatters(formats, columnExtents);
    rowFormatters = compileRowFormatters(formats, columnExtents);
  } catch (e) {
    console.error(e);
  }
  const colIndexes = _.object(cols.map((col, index) => [col.name, index]));
  if (Object.values(formatters).length === 0 && rowFormatters.length === 0) {
    return () => null;
  } else {
    return function(value, rowIndex, colName) {
      if (formatters[colName]) {
        // const value = rows[rowIndex][colIndexes[colName]];
        for (const formatter of formatters[colName]) {
          const color = formatter(value);
          if (color != null) {
            return color;
          }
        }
      }
      // don't highlight row for pivoted tables
      if (!pivot) {
        for (const rowFormatter of rowFormatters) {
          const color = rowFormatter(rows[rowIndex], colIndexes);
          if (color != null) {
            return color;
          }
        }
      }
    };
  }
}

function compileFormatter(
  format,
  columnName,
  columnExtents,
  isRowFormatter = false,
) {
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
      columnExtents && columnExtents[name] && columnExtents[name][0];
    const columnMax = name =>
      columnExtents && columnExtents[name] && columnExtents[name][1];

    const min =
      format.min_type === "custom"
        ? format.min_value
        : format.min_type === "all"
          ? Math.min(...format.columns.map(columnMin))
          : columnMin(columnName);
    const max =
      format.max_type === "custom"
        ? format.max_value
        : format.max_type === "all"
          ? Math.max(...format.columns.map(columnMax))
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

function computeColumnExtents(formats, data) {
  return _.chain(formats)
    .map(format => format.columns)
    .flatten()
    .uniq()
    .map(columnName => {
      const colIndex = _.findIndex(data.cols, col => col.name === columnName);
      return [columnName, d3.extent(data.rows, row => row[colIndex])];
    })
    .object()
    .value();
}

function compileFormatters(formats, columnExtents) {
  const formatters = {};
  for (const format of formats) {
    for (const columnName of format.columns) {
      formatters[columnName] = formatters[columnName] || [];
      formatters[columnName].push(
        compileFormatter(format, columnName, columnExtents, false),
      );
    }
  }
  return formatters;
}

function compileRowFormatters(formats) {
  const rowFormatters = [];
  for (const format of formats.filter(
    format => format.type === "single" && format.highlight_row,
  )) {
    const formatter = compileFormatter(format, null, null, true);
    if (formatter) {
      for (const colName of format.columns) {
        rowFormatters.push((row, colIndexes) =>
          formatter(row[colIndexes[colName]]),
        );
      }
    }
  }
  return rowFormatters;
}
