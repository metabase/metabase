import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

// Migrates `field_ref`-based settings to `desired_column_alias`
export function migrateVizSettings(
  settings: VisualizationSettings,
  series?: Series | null,
  previousSeries?: Series | null,
): VisualizationSettings {
  let newSettings = settings;

  const singleSeries = series?.[0];
  const previousSingleSeries = previousSeries?.[0];

  if (singleSeries?.data && !singleSeries?.error) {
    if (previousSingleSeries?.data && !previousSingleSeries?.error) {
      newSettings = migrateTableColumnSettings(
        newSettings,
        previousSingleSeries,
      );
    }
  }

  return newSettings;
}

function migrateTableColumnSettings(
  settings: VisualizationSettings,
  { data }: SingleSeries,
): VisualizationSettings {
  const columnSettings = settings["table.columns"] ?? [];
  if (columnSettings.every(setting => setting.desired_column_alias)) {
    return settings;
  }

  const columnIndexes = findColumnIndexesForColumnSettings(
    data.cols,
    columnSettings,
  );

  const newColumnSettings = columnSettings.map((setting, settingIndex) => ({
    ...setting,
    desired_column_alias:
      data.cols[columnIndexes[settingIndex]]?.desired_column_alias ??
      setting.desired_column_alias,
  }));

  return {
    ...settings,
    "table.columns": newColumnSettings,
  };
}
