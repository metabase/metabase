import { getColorsForValues } from "metabase/lib/colors/charts";
import { SLICE_THRESHOLD } from "metabase/visualizations/echarts/pie/constants";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export const getDefaultShowLegend = () => true;

export const getDefaultShowTotal = () => true;

export const getDefaultPercentVisibility = () => "legend";

export const getDefaultSliceThreshold = () => SLICE_THRESHOLD * 100;

export function getDefaultColors(
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
  const dimensionValues = rows.map(r => String(r[dimensionIndex]));

  return getColorsForValues(dimensionValues, currentSettings["pie.colors"]);
}
