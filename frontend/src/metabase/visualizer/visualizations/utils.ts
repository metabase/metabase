import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

/**
 * Ensures that the column is removed from the state if it is not used in any settings.
 *
 * @param state the state (will be mutated)
 * @param columnName the name of the column to remove
 * @param settingsKeys the settings keys to check against
 */
export function removeColumnFromStateUnlessUsedElseWhere(
  state: VisualizerVizDefinitionWithColumns,
  columnName: string,
  settingsKeys: string[],
) {
  const columnUsedInSettings = settingsKeys.some((key) => {
    const setting = state.settings[key];
    if (Array.isArray(setting)) {
      return setting.some((item) => item === columnName);
    }

    return state.settings[key] === columnName;
  });

  if (columnUsedInSettings) {
    return;
  }

  state.columns = state.columns.filter((col) => col.name !== columnName);

  // This should not be necessary, but for some reason
  // directly mutating the state also removes it from any past/future states
  // that are in the history. ¯\_(ツ)_/¯
  const columnValuesMapping = { ...state.columnValuesMapping };
  delete columnValuesMapping[columnName];
  state.columnValuesMapping = columnValuesMapping;
}
