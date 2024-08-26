import { getColorsForValues } from "metabase/lib/colors/charts";
import { isNumber } from "metabase/lib/types";
import { SLICE_THRESHOLD } from "metabase/visualizations/echarts/pie/constants";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, RowValues } from "metabase-types/api";

export const getDefaultShowLegend = () => true;

export const getDefaultShowTotal = () => true;

export const getDefaultPercentVisibility = () => "legend";

export const getDefaultSliceThreshold = () => SLICE_THRESHOLD * 100;

export function getAggregatedRows(
  rows: RowValues[],
  dimensionIndex: number,
  metricIndex: number,
) {
  const dimensionToMetricValues = new Map<string, number>();
  rows.forEach(row => {
    const dimensionValue = String(row[dimensionIndex]);
    const metricValue = getNumberOr(row[metricIndex], 0);

    const existingMetricValue =
      dimensionToMetricValues.get(dimensionValue) ?? 0;

    dimensionToMetricValues.set(
      dimensionValue,
      metricValue + existingMetricValue,
    );
  });

  const aggregatedRows: RowValues[] = [];
  const seenDimensionValues = new Set<string>();

  rows.forEach(row => {
    const dimensionValue = String(row[dimensionIndex]);
    if (seenDimensionValues.has(dimensionValue)) {
      return;
    }
    seenDimensionValues.add(dimensionValue);

    const metricValue = dimensionToMetricValues.get(dimensionValue);
    if (metricValue === undefined) {
      throw Error(
        `No metric value found for dimension value ${dimensionValue}`,
      );
    }
    const newRow = [...row];
    newRow[metricIndex] = metricValue;

    aggregatedRows.push(newRow);
  });

  return aggregatedRows;
}

export function getSortedAggregatedRows(
  rows: RowValues[],
  dimensionIndex: number,
  metricIndex: number,
) {
  const aggregatedRows = getAggregatedRows(rows, dimensionIndex, metricIndex);

  return aggregatedRows.sort((rowA, rowB) => {
    const valueA = rowA[metricIndex];
    const valueB = rowB[metricIndex];

    if (!isNumber(valueA) && !isNumber(valueB)) {
      return 0;
    }
    if (!isNumber(valueA)) {
      return 1;
    }
    if (!isNumber(valueB)) {
      return -1;
    }
    return valueB - valueA;
  });
}

export function getColors(
  rawSeries: RawSeries,
  currentSettings: Partial<ComputedVisualizationSettings>,
): ComputedVisualizationSettings["pie.colors"] {
  const [
    {
      data: { rows, cols },
    },
  ] = rawSeries;

  const dimensionIndex = cols.findIndex(
    col => col.name === currentSettings["pie.dimension"],
  );
  const metricIndex = cols.findIndex(
    col => col.name === currentSettings["pie.metric"],
  );
  const sortedRows = getSortedAggregatedRows(rows, dimensionIndex, metricIndex);

  const dimensionValues = sortedRows.map(r => String(r[dimensionIndex]));

  // Sometimes viz settings are malformed and "pie.colors" does not
  // contain a key for the current dimension value, so we need to compute
  // defaults to ensure every key has a color.
  const defaultColors = getColorsForValues(
    dimensionValues,
    currentSettings["pie.colors"],
  );

  return { ...defaultColors, ...currentSettings["pie.colors"] };
}
