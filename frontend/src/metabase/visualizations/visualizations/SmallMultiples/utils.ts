import { formatBreakoutValue } from "metabase/viz-core";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  RawSeries,
  RowValue,
  SingleSeries,
} from "metabase-types/api";

const compareValues = (a: RowValue, b: RowValue): number => {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
};

export type SmallMultiple = {
  /** The column's value, formatted as a legend would show it. */
  label: string;
  value: RowValue;
  series: RawSeries;
};

/**
 * The series split into a `display` chart per value of `column`, in the order
 * the values first appear. Each has a row for every x-axis value any of them
 * has, in the same order, so they line up. Null when a column the charts need
 * isn't in the result.
 */
export const getSmallMultiples = (
  [series]: RawSeries,
  column: string,
  display: CardDisplayType,
): SmallMultiple[] | null => {
  const { card, data } = series;
  const settings = card.visualization_settings;
  const dimensions = settings["graph.dimensions"] ?? [];
  const [metricName] = settings["graph.metrics"] ?? [];
  const indexOf = (name: string | null | undefined) =>
    data.cols.findIndex((col) => col.name === name);
  const panelIndex = indexOf(column);
  const xIndex = indexOf(dimensions[0]);
  const metricIndex = indexOf(metricName);
  if (panelIndex < 0 || xIndex < 0 || metricIndex < 0) {
    return null;
  }
  // Kept on a missing x's row, so it lands in the right series.
  const keptIndexes = new Set([panelIndex, ...dimensions.map(indexOf)]);

  const rowsByPanel = new Map<RowValue, RowValue[][]>();
  for (const row of data.rows) {
    const value = row[panelIndex];
    rowsByPanel.set(value, [...(rowsByPanel.get(value) ?? []), row]);
  }
  const xValues = [...new Set(data.rows.map((row) => row[xIndex]))];
  // Dates and numbers have an order of their own; other values keep the
  // order they first appear in.
  const xColumn = data.cols[xIndex];
  if (isDate(xColumn) || isNumeric(xColumn)) {
    xValues.sort(compareValues);
  }

  return [...rowsByPanel.entries()].map(([value, rows]) => {
    const [template] = rows;
    const panelRows = xValues.flatMap((x) => {
      const rowsAtX = rows.filter((row) => row[xIndex] === x);
      if (rowsAtX.length > 0) {
        return rowsAtX;
      }
      return [
        template.map((cell, index) => {
          if (index === xIndex) {
            return x;
          }
          if (index === metricIndex) {
            return 0;
          }
          return keptIndexes.has(index) ? cell : null;
        }),
      ];
    });
    const panel: SingleSeries = {
      card: { ...card, display },
      data: { ...data, rows: panelRows },
    };
    return {
      label: formatBreakoutValue(value, data.cols[panelIndex]),
      value,
      series: [panel],
    };
  });
};
