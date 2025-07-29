import {
  getColumnKey,
  getColumnNameFromKey,
} from "metabase-lib/v1/queries/utils/column-key";
import type { VisualizationSettings } from "metabase-types/api";

/**
 * Recursively converts visualization settings to use the new column references.
 *
 * If the settings contain the color for a series called, say, `avg` (`{colors: {avg: "#000"}}`),
 * and the column reference for `avg` is `COLUMN_1`, this function will convert it
 * to `{colors: {COLUMN_1: "#000"}}`.
 *
 *
 * @param settings the settings to convert
 * @param columnsToRefs the mapping of column names to their references
 * @returns the converted settings
 */
export function updateVizSettingsKeysWithRefs(
  settings: VisualizationSettings,
  columnsToRefs: Record<string, string>,
): VisualizationSettings {
  if (typeof settings !== "object" || settings === null) {
    return settings;
  }

  if (Array.isArray(settings)) {
    return settings.map((item) =>
      updateVizSettingsKeysWithRefs(item, columnsToRefs),
    );
  }

  if (typeof settings === "object") {
    const newSettings: VisualizationSettings = {};

    for (const key in settings) {
      // If the key exists in columnsToRefs, use the reference as the new key
      const newKey = getMappedVizSettingValue(key, columnsToRefs);

      // Process the value recursively
      const value = settings[key];
      const newValue =
        typeof value === "object" && value !== null
          ? updateVizSettingsKeysWithRefs(value, columnsToRefs)
          : value;

      // Add the entry with the new key and processed value
      newSettings[newKey] = newValue;
    }

    return newSettings;
  }

  return settings;
}

/**
 * Updates settings by replacing specified keys with their corresponding references
 * @param {Object} settings - The original settings object
 * @param {Object} columnsToRefs - Mapping of column names to their reference values
 * @param {Array<string>} [keysToUpdate] - Optional list of specific settings keys to update
 * @return {Object} - New settings object with updated references
 */
function updateSettingsValuesWithRefs(
  settings: VisualizationSettings,
  columnsToRefs: Record<string, string>,
  keysToUpdate: Array<keyof VisualizationSettings>,
): VisualizationSettings {
  const newSettings = { ...settings };

  keysToUpdate.forEach((key) => {
    if (key in newSettings) {
      newSettings[key] = Array.isArray(newSettings[key])
        ? newSettings[key].map((value: string) =>
            getMappedVizSettingValue(value, columnsToRefs),
          )
        : getMappedVizSettingValue(newSettings[key], columnsToRefs);
    }
  });

  return newSettings;
}

function getMappedVizSettingValue(
  value: string,
  columnsToRefs: Record<string, string>,
) {
  if (value in columnsToRefs) {
    return columnsToRefs[value];
  }

  const columnName = getColumnNameFromKey(value);
  if (columnName && columnName in columnsToRefs) {
    return getColumnKey({ name: columnsToRefs[columnName] });
  }

  return value;
}

/**
 * Recursively converts visualization settings to use the new column references.
 *
 * If the settings contain the color for a series called, say, `avg` (`{colors: {avg: "#000"}}`),
 * and the column reference for `avg` is `COLUMN_1`, this function will convert it
 * to `{colors: {COLUMN_1: "#000"}}`.
 *
 *
 * @param settings the settings to convert
 * @param columnsToRefs the mapping of column names to their references
 * @returns the converted settings
 */
export function updateVizSettingsWithRefs(
  settings: VisualizationSettings,
  columnsToRefs: Record<string, string>,
): VisualizationSettings {
  const settingsWithUpdatedKeys = updateVizSettingsKeysWithRefs(
    settings,
    columnsToRefs,
  );
  const settingsWithUpdatedValues = updateSettingsValuesWithRefs(
    settingsWithUpdatedKeys,
    columnsToRefs,
    ["graph.series_order_dimension", "graph.tooltip_columns"],
  );
  return settingsWithUpdatedValues;
}
