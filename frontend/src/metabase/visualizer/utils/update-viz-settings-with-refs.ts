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
export function updateVizSettingsWithRefs(
  settings: VisualizationSettings,
  columnsToRefs: Record<string, string>,
): VisualizationSettings {
  if (typeof settings !== "object" || settings === null) {
    return settings;
  }

  if (Array.isArray(settings)) {
    return settings.map((item) =>
      updateVizSettingsWithRefs(item, columnsToRefs),
    );
  }

  if (typeof settings === "object") {
    const newSettings: VisualizationSettings = {};

    for (const key in settings) {
      // If the key exists in columnsToRefs, use the reference as the new key
      const newKey = columnsToRefs[key] || key;

      // Process the value recursively
      const value = settings[key];
      const newValue =
        typeof value === "object" && value !== null
          ? updateVizSettingsWithRefs(value, columnsToRefs)
          : value;

      // Add the entry with the new key and processed value
      newSettings[newKey] = newValue;
    }

    return newSettings;
  }

  return settings;
}
