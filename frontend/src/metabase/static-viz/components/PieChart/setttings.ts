import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { PieChartSettings, RawSeries } from "metabase-types/api";
import { getDefaultDimensionAndMetric } from "metabase/visualizations/lib/utils";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { SLICE_THRESHOLD } from "metabase/visualizations/echarts/pie/constants";
import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";

function getPieChartColors(
  rawSeries: RawSeries,
  currentSettings: Partial<PieChartSettings>,
): PieChartSettings["pie.colors"] {
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

export function computeStaticPieChartSettings(
  rawSeries: RawSeries,
): ComputedVisualizationSettings {
  const settings = getCommonStaticVizSettings(rawSeries);

  if (!settings["pie.dimension"] || !settings["pie.metric"]) {
    const defaults = getDefaultDimensionAndMetric(rawSeries);
    settings["pie.dimension"] ??= defaults.dimension;
    settings["pie.metric"] ??= defaults.metric;
  }

  settings["pie.show_legend"] ??= true;
  settings["pie.show_total"] ??= true;
  settings["pie.percent_visibility"] ??= "legend";
  settings["pie.slice_threshold"] ??= SLICE_THRESHOLD * 100;
  settings["pie.colors"] ??= getPieChartColors(rawSeries, settings);

  return settings;
}
