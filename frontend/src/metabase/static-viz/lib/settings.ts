import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
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

export const getCommonStaticVizSettings = (rawSeries: RawSeries) => {
  const [{ card }] = rawSeries;

  const settings: ComputedVisualizationSettings = {
    ...card.visualization_settings,
    column: (column: RemappingHydratedDatasetColumn) =>
      getColumnSettings(column, settings),
  };

  return settings;
};
