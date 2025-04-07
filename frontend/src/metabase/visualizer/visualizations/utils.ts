import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

/**
 * Ensures that the column is removed from the state if it is not used in any settings.
 *
 * @param state the state (will be mutated)
 * @param columnName the name of the column to remove
 * @param settingsKeys the settings keys to check against
 */
export function removeColumnfromStateUnlessUsedElseWhere(
  state: VisualizerHistoryItem,
  columnName: string,
  settingsKeys: string[],
) {
  const columnUsedInSettings = settingsKeys.some(
    key => state.settings[key] === columnName,
  );

  if (columnUsedInSettings) {
    return;
  }

  state.columns = state.columns.filter(col => col.name !== columnName);
  delete state.columnValuesMapping[columnName];
}
