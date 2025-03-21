import { isNotNull } from "metabase/lib/types";
import { getColumnVizSettings } from "metabase/visualizations";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { Card, DatasetColumn } from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import { createDataSource } from "./data-source";

function pickColumnsFromTableToBarChart(
  originalColumns: DatasetColumn[],
): DatasetColumn[] {
  const isSuitableMetric = getDefaultMetricFilter("bar");
  const isSuitableDimension = getDefaultDimensionFilter("bar");
  let foundMetric = false;
  let foundDimension = false;

  const columns: DatasetColumn[] = [];

  // using "every" to break the loop early
  originalColumns.every(column => {
    if (!foundMetric && isSuitableMetric(column)) {
      columns.push(column);
      foundMetric = true;
    } else if (!foundDimension && isSuitableDimension(column)) {
      columns.push(column);
      foundDimension = true;
    }

    if (columns.length >= 2) {
      return false;
    }

    return true;
  });

  return columns;
}

export function getInitialStateForCardDataSource(
  card: Card,
  originalColumns: DatasetColumn[],
): VisualizerHistoryItem {
  const state: VisualizerHistoryItem = {
    display: card.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };
  const dataSource = createDataSource("card", card.id, card.name);

  // if the original card is a table, let's only use two columns
  // in the resulting bar chart
  const columns =
    card.display === "table"
      ? pickColumnsFromTableToBarChart(originalColumns)
      : originalColumns;

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
    "card.title": card.name,
  };

  return state;
}
