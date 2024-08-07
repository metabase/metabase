import { getColorsForValues } from "metabase/lib/colors/charts";
import { isNumber } from "metabase/lib/types";
import { SLICE_THRESHOLD } from "metabase/visualizations/echarts/pie/constants";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, RowValues } from "metabase-types/api";

export const getDefaultShowLegend = () => true;

export const getDefaultShowTotal = () => true;

export const getDefaultPercentVisibility = () => "legend";

export const getDefaultSliceThreshold = () => SLICE_THRESHOLD * 100;

export function getSortedRows(rows: RowValues[], metricIndex: number) {
  return rows.sort((rowA, rowB) => {
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
  const sortedRows = getSortedRows(rows, metricIndex);

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
