import {
  fillWithDefaultValue,
  getCommonStaticVizSettings,
} from "metabase/static-viz/lib/settings";
import {
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";
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
  const { dimension: defaultDimension, metric: defaultMetric } =
    getDefaultDimensionAndMetric(rawSeries);

  const dimensionIsValid = columnsAreValid(
    settings["pie.dimension"],
    rawSeries[0].data,
  );
  const metricIsValid = columnsAreValid(
    settings["pie.metric"],
    rawSeries[0].data,
  );

  fillWithDefaultValue(
    settings,
    "pie.dimension",
    defaultDimension,
    dimensionIsValid,
  );
  fillWithDefaultValue(settings, "pie.metric", defaultMetric, metricIsValid);
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
  fillWithDefaultValue(
    settings,
    "pie.colors",
    getDefaultColors(rawSeries, settings),
  );

  return settings;
}
