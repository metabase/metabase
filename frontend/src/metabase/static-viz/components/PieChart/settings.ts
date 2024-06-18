import {
  fillWithDefaultValue,
  getCommonStaticVizSettings,
} from "metabase/static-viz/lib/settings";
import { getDefaultDimensionAndMetric } from "metabase/visualizations/lib/utils";
import {
  getDefaultColors,
  getDefaultPercentVisibility,
  getDefaultShowLegend,
  getDefaultShowTotal,
  getDefaultSliceThreshold,
} from "metabase/visualizations/shared/settings/pie";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

export function computeStaticPieChartSettings(
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
): ComputedVisualizationSettings {
  const settings = getCommonStaticVizSettings(rawSeries, dashcardSettings);
  const { dimension, metric } = getDefaultDimensionAndMetric(rawSeries);

  fillWithDefaultValue(settings, "pie.dimension", dimension);
  fillWithDefaultValue(settings, "pie.metric", metric);
  fillWithDefaultValue(settings, "pie.show_legend", getDefaultShowLegend());
  fillWithDefaultValue(settings, "pie.show_total", getDefaultShowTotal());
  fillWithDefaultValue(
    settings,
    "pie.percent_visibility",
    getDefaultPercentVisibility(),
  );
  fillWithDefaultValue(
    settings,
    "pie.slice_threshold",
    getDefaultSliceThreshold(),
  );

  // If there aleady is an object for the "pie.colors" setting, we still have to
  // compute the default colors for the dimension values and merge it with the
  // existing object, because sometimes the saved setting is missing entries for
  // the current dimension values.
  const defaultColors = getDefaultColors(rawSeries, settings);
  if (settings["pie.colors"] != null) {
    settings["pie.colors"] = { ...settings["pie.colors"], ...defaultColors };
  } else {
    settings["pie.colors"] = defaultColors;
  }

  return settings;
}
