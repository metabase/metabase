import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { getColumnVizSettings } from "metabase/visualizations";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  DatasetColumn,
  SingleSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import { createDataSource } from "./data-source";

export function getDefaultVisualizationName() {
  return t`My new visualization`;
}

const areaBarLine = ["area", "bar", "line"];

export function canCombineCard(
  display: VisualizationDisplay,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  card: Card,
) {
  if (areaBarLine.includes(display) && areaBarLine.includes(card.display)) {
    return areAreaBarLineSeriesCompatible(columns, settings, card);
  }

  if (display === "funnel" && card.display === "scalar") {
    return columns.length === 1;
  }

  if (display === "scalar" && card.display === "scalar") {
    return columns.length === 1 && card.result_metadata.length === 1;
  }

  return false;
}

// Mimics the `area-bar-line-series-are-compatible?` fn from `GET /api/card/:id/series`
// https://github.com/metabase/metabase/blob/5cfc079d1db6e69bf42705f0eeba431a6e39c6b5/src/metabase/api/card.clj#L219
function areAreaBarLineSeriesCompatible(
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  card: Card,
) {
  const initialDimensions = (settings["graph.dimensions"] ?? []).map(col =>
    columns.find(c => c.name === col),
  );
  const newDimensions = (
    card.visualization_settings["graph.dimensions"] ?? []
  ).map(col => card.result_metadata.find(c => c.name === col));
  const newMetrics = (card.visualization_settings["graph.metrics"] ?? []).map(
    col => card.result_metadata.find(c => c.name === col),
  );

  if (
    newDimensions.length === 0 ||
    newMetrics.length === 0 ||
    !newMetrics.every(isNumeric)
  ) {
    return false;
  }

  const [primaryInitialDimension] = initialDimensions;
  const [primaryNewDimension] = newDimensions;

  // both or neither primary dimension must be dates
  // both or neither primary dimension must be numeric
  // TODO handle 👇
  // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
  return (
    primaryNewDimension &&
    primaryInitialDimension &&
    (isDate(primaryInitialDimension) === isDate(primaryNewDimension) ||
      isNumeric(primaryInitialDimension) !== isNumeric(primaryNewDimension))
  );
}

export function getInitialStateForCardDataSource({
  card,
  data,
}: SingleSeries): VisualizerHistoryItem {
  const state: VisualizerHistoryItem = {
    display: card.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };
  const dataSource = createDataSource("card", card.id, card.name);

  data.cols.forEach(column => {
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );
    state.columns.push(copyColumn(columnRef.name, column));
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
            const index = data.cols.findIndex(
              col => col.name === originalColumnName,
            );
            return state.columns[index].name;
          }),
        ];
      } else {
        const index = data.cols.findIndex(col => col.name === originalValue);
        return [setting, state.columns[index].name];
      }
    })
    .filter(isNotNull);

  state.settings = {
    ...card.visualization_settings,
    ...Object.fromEntries(entries),
  };

  return state;
}
