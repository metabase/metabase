import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  fillWithDefaultValue,
  getCommonStaticVizSettings,
} from "metabase/static-viz/lib/settings";
import {
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";
import {
  getColors,
  getDefaultPercentVisibility,
  getDefaultShowLegend,
  getDefaultShowTotal,
  getDefaultSliceThreshold,
  getDefaultSortRows,
  getPieRows,
} from "metabase/visualizations/shared/settings/pie";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export function computeStaticPieChartSettings(
  rawSeries: RawSeries,
): ComputedVisualizationSettings {
  const settings = getCommonStaticVizSettings(rawSeries);
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

  fillWithDefaultValue(settings, "pie.sort_rows", getDefaultSortRows);

  fillWithDefaultValue(
    settings,
    "pie.slice_threshold",
    getDefaultSliceThreshold(),
  );

  settings["pie.colors"] = getColors(rawSeries, settings);

  settings["pie.rows"] = getPieRows(rawSeries, settings, (value, options) =>
    formatStaticValue(value, options ?? {}),
  );

  fillWithDefaultValue(settings, "pie.show_legend", getDefaultShowLegend());
  fillWithDefaultValue(settings, "pie.show_total", getDefaultShowTotal());
  fillWithDefaultValue(
    settings,
    "pie.percent_visibility",
    getDefaultPercentVisibility(),
  );

  return settings;
}
