import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { getDefaultDimensionAndMetric } from "metabase/visualizations/lib/utils";
import { getColorsForValues } from "metabase/lib/colors/charts";

import { normalize } from "metabase-lib/queries/utils/normalize";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

const getColumnSettings = (
  column: DatasetColumn,
  settings: VisualizationSettings,
) => {
  const columnKey = Object.keys(settings.column_settings ?? {}).find(
    possiblyDenormalizedFieldRef =>
      normalize(possiblyDenormalizedFieldRef) === getColumnKey(column),
  );

  if (!columnKey) {
    return null;
  }

  return settings.column_settings?.[columnKey];
};

// should be in sync with the dynamic chart settings definitions logic
export const computeStaticPieChartSettings = (
  series: RawSeries,
): ComputedVisualizationSettings => {
  const [{ card, data }] = series;
  const { rows, cols } = data;
  const settings: ComputedVisualizationSettings = {
    ...card.visualization_settings,
    column: (column: RemappingHydratedDatasetColumn) =>
      getColumnSettings(column, settings),
  };

  const defaults = getDefaultDimensionAndMetric(series);
  settings["pie.dimension"] ??= defaults.dimension;
  settings["pie.metric"] ??= defaults.metric;

  const dimensionIndex = cols.findIndex(
    col => col.name === settings["pie.dimension"],
  );

  const dimensionValues = rows.map(row => String(row[dimensionIndex]));

  settings["pie.colors"] ??= getColorsForValues(
    dimensionValues,
    settings["pie.colors"] ?? {},
  );
  settings["pie.show_total"] ??= true;
  settings["pie.percent_visibility"] ??= "legend";
  settings["pie.slice_threshold"] ??= 1;

  return settings;
};
