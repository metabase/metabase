import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import { getObjectColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

const getColumnSettings = (
  column: DatasetColumn,
  settings: VisualizationSettings,
): Record<string, unknown> => {
  const storedSettings = getObjectColumnSettings(
    settings.column_settings,
    column,
  );
  const columnSettings = { column, ...column.settings, ...storedSettings };
  return columnSettings;
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
