import { isNotNull } from "metabase/lib/types";
import { getColumnVizSettings } from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Card, Dataset, DatasetColumn } from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import {
  DEFAULT_VISUALIZER_DISPLAY,
  isVisualizerSupportedVisualization,
} from "./dashboard-card-supports-visualizer";
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
  originalColumns.every((column) => {
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
  dataset: Dataset,
): VisualizerHistoryItem {
  const {
    data: { cols: originalColumns },
  } = dataset;

  const state: VisualizerHistoryItem = {
    display: isVisualizerSupportedVisualization(card.display)
      ? card.display
      : DEFAULT_VISUALIZER_DISPLAY,
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

  columns.forEach((column) => {
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

  const computedSettings: ComputedVisualizationSettings =
    getComputedSettingsForSeries([
      {
        ...dataset,
        card: { ...card, display: state.display },
      },
    ]);

  const entries = getColumnVizSettings(state.display!)
    .map((setting) => {
      const originalValue = computedSettings[setting];

      if (!originalValue) {
        return null;
      }

      if (Array.isArray(originalValue)) {
        return [
          setting,
          originalValue.map((originalColumnName) => {
            const index = columns.findIndex(
              (col) => col.name === originalColumnName,
            );
            return state.columns[index].name;
          }),
        ];
      } else {
        const index = columns.findIndex((col) => col.name === originalValue);
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
