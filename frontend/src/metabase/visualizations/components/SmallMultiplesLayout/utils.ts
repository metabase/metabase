import {
  type ComputedVisualizationSettings,
  formatBreakoutValue,
} from "metabase/viz-core";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries, RowValue, SingleSeries } from "metabase-types/api";

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
 * The column to draw a chart per value of: `small_multiples.column`, a
 * Sankey's breakout when it's stacked, or a cartesian chart's breakout
 * dimension when split panels are drawn as small multiples. Null for a
 * single chart.
 */
export const getSmallMultiplesColumn = (
  settings: ComputedVisualizationSettings,
): string | null => {
  const column = settings["small_multiples.column"];
  if (typeof column === "string") {
    return column;
  }
  const sankeyBreakout = settings["sankey.breakout"];
  if (settings["sankey.split_panels"] === true && sankeyBreakout != null) {
    return sankeyBreakout;
  }
  const [, breakout] = settings["graph.dimensions"] ?? [];
  const isSplitByBreakout =
    settings["graph.split_panels"] === true &&
    settings["graph.split_panels_small_multiples"] === true;
  return isSplitByBreakout && typeof breakout === "string" ? breakout : null;
};

/**
 * The series split into a chart per value of `column`, in the order the
 * values first appear. On a chart with an x-axis, each has a row for every
 * x value any of them has, in the same order, so they line up. Null when
 * `column` isn't in the result.
 */
export const getSmallMultiples = (
  [series]: RawSeries,
  column: string,
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
  if (panelIndex < 0) {
    return null;
  }
  // Without an x-axis and a metric, like a Sankey's, there's nothing to pad.
  const canPad = xIndex >= 0 && metricIndex >= 0;
  // Kept on a missing x's row, so it lands in the right series.
  const keptIndexes = new Set([panelIndex, ...dimensions.map(indexOf)]);

  const rowsByPanel = new Map<RowValue, RowValue[][]>();
  for (const row of data.rows) {
    const value = row[panelIndex];
    rowsByPanel.set(value, [...(rowsByPanel.get(value) ?? []), row]);
  }
  const xValues = canPad
    ? [...new Set(data.rows.map((row) => row[xIndex]))]
    : [];
  // Dates and numbers have an order of their own; other values keep the
  // order they first appear in.
  const xColumn = data.cols[xIndex];
  if (canPad && (isDate(xColumn) || isNumeric(xColumn))) {
    xValues.sort(compareValues);
  }

  return [...rowsByPanel.entries()].map(([value, rows]) => {
    const [template] = rows;
    const paddedRows = xValues.flatMap((x) => {
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
      card,
      data: { ...data, rows: canPad ? paddedRows : rows },
    };
    return {
      label: formatBreakoutValue(value, data.cols[panelIndex]),
      value,
      series: [panel],
    };
  });
};
