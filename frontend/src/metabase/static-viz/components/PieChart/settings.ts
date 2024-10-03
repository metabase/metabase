import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  fillWithDefaultValue,
  getCommonStaticVizSettings,
} from "metabase/static-viz/lib/settings";
import { columnsAreValid } from "metabase/visualizations/lib/utils";
import {
  getColors,
  getDefaultPercentVisibility,
  getDefaultPieColumns,
  getDefaultShowLabels,
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
  const defaultColumns = getDefaultPieColumns(rawSeries);
  fillWithDefaultValue(
    settings,
    "pie.dimension",
    defaultColumns.dimension,
    columnsAreValid(settings["pie.dimension"], rawSeries[0].data),
  );

  fillWithDefaultValue(
    settings,
    "pie.metric",
    defaultColumns.metric,
    columnsAreValid(settings["pie.metric"], rawSeries[0].data),
  );

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
    "pie.show_labels",
    getDefaultShowLabels(settings),
  );
  fillWithDefaultValue(
    settings,
    "pie.percent_visibility",
    getDefaultPercentVisibility(),
  );

  return settings;
}
