import { isNotNull } from "metabase/lib/types";
import { getColumnVizSettings } from "metabase/visualizations";
import type { Card, DatasetColumn } from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import { createDataSource } from "./data-source";

export function getInitialStateForCardDataSource(
  card: Card,
  columns: DatasetColumn[],
): VisualizerHistoryItem {
  const state: VisualizerHistoryItem = {
    display: card.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };
  const dataSource = createDataSource("card", card.id, card.name);

  columns.forEach(column => {
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );
    state.columns.push(
      copyColumn(columnRef.name, column, dataSource.name, state.columns),
    );
    state.columnValuesMapping[columnRef.name] = [columnRef];
  });

  const entries = getColumnVizSettings(card.display)
    .map(setting => {
      const originalValue = card.visualization_settings[setting];

      if (!originalValue) {
        return null;
      }

      if (Array.isArray(originalValue)) {
        return [
          setting,
          originalValue.map(originalColumnName => {
            const index = columns.findIndex(
              col => col.name === originalColumnName,
            );
            return state.columns[index].name;
          }),
        ];
      } else {
        const index = columns.findIndex(col => col.name === originalValue);
        if (!state.columns[index]) {
          return;
        }

        return [setting, state.columns[index]?.name];
      }
    })
    .filter(isNotNull);

  state.settings = {
    ...card.visualization_settings,
    ...Object.fromEntries(entries),
  };

  return state;
}
