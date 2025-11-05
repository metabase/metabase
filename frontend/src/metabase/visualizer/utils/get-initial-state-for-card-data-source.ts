import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { isNotNull } from "metabase/lib/types";
import { isCartesianChart } from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { getColumnNameFromKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  Card,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumnsAndFallbacks } from "metabase-types/store/visualizer";

import {
  createDimensionColumn,
  createMetricColumn,
} from "../visualizations/funnel";

import {
  addColumnMapping,
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import {
  DEFAULT_VISUALIZER_DISPLAY,
  isVisualizerSupportedVisualization,
} from "./dashboard-card-supports-visualizer";
import { createDataSource, createDataSourceNameRef } from "./data-source";
import { updateVizSettingsWithRefs } from "./update-viz-settings-with-refs";
import { getColumnVizSettings } from "./viz-settings";

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
    if (isPivotGroupColumn(column)) {
      // skip pivot grouping column
      return true;
    }

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

function pickColumns(
  display: VisualizationDisplay,
  originalColumns: DatasetColumn[],
  settings: ComputedVisualizationSettings,
) {
  if (display === "table" || display === "pivot") {
    // if the original card is a table, let's only use two columns
    // in the resulting bar chart
    return pickColumnsFromTableToBarChart(originalColumns);
  }

  if (isCartesianChart(display)) {
    const tooltipColumns = (settings["graph.tooltip_columns"] || []).map(
      getColumnNameFromKey,
    );

    return originalColumns.filter((col) => {
      return (
        settings["graph.metrics"]?.includes(col.name) ||
        settings["graph.dimensions"]?.includes(col.name) ||
        tooltipColumns.includes(col.name)
      );
    });
  }

  return originalColumns;
}

export function getInitialStateForCardDataSource(
  card: Card,
  dataset: Dataset,
): VisualizerVizDefinitionWithColumnsAndFallbacks {
  const {
    data: { cols: originalColumns },
  } = dataset;

  const state: VisualizerVizDefinitionWithColumnsAndFallbacks = {
    display: isVisualizerSupportedVisualization(card.display)
      ? card.display
      : DEFAULT_VISUALIZER_DISPLAY,
    columns: [],
    columnValuesMapping: {},
    settings: {},
    datasetFallbacks: { [card.id]: dataset },
  };

  const dataSource = createDataSource("card", card.id, card.name);

  if (card.display === "scalar" || card.display === "gauge") {
    const numericColumn = originalColumns.find((col) =>
      Lib.isNumeric(Lib.legacyColumnTypeInfo(col)),
    );
    if (numericColumn) {
      state.display = "funnel";

      const columnRef = createVisualizerColumnReference(
        dataSource,
        numericColumn,
        [],
      );

      state.columns.push(
        createMetricColumn("METRIC", numericColumn.effective_type),
        createDimensionColumn("DIMENSION"),
      );

      state.columnValuesMapping["METRIC"] = addColumnMapping(
        state.columnValuesMapping["METRIC"],
        columnRef,
      );
      state.columnValuesMapping["DIMENSION"] = addColumnMapping(
        state.columnValuesMapping["DIMENSION"],
        createDataSourceNameRef(dataSource.id),
      );

      state.settings["funnel.metric"] = "METRIC";
      state.settings["funnel.dimension"] = "DIMENSION";

      return state;
    }
  }

  const computedSettings: ComputedVisualizationSettings =
    getComputedSettingsForSeries([
      {
        ...dataset,
        // Using state.display to get viz settings
        // relevant to a new visualization vs. original card
        // (e.g. if a card is a smartscalar, it won't have any relevant viz settings)
        card: { ...card, display: state.display },
      },
    ]);

  const columnsToRefs: Record<string, string> = {};
  const columns = pickColumns(card.display, originalColumns, computedSettings);

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
    columnsToRefs[column.name] = columnRef.name;
  });

  const entries = getColumnVizSettings(state.display!)
    .map((setting) => {
      const originalValue = computedSettings[setting];

      if (!originalValue) {
        return null;
      }

      if (Array.isArray(originalValue)) {
        // When there are no sensible metrics/dimensions,
        // "graph.dimensions" and "graph.metrics" are `[null]`
        if (originalValue.filter(Boolean).length === 0) {
          return;
        } else {
          return [
            setting,
            originalValue
              .map((originalColumnName) => {
                const index = columns.findIndex(
                  (col) => col.name === originalColumnName,
                );

                if (index === -1 || !state.columns[index]) {
                  return null;
                }

                return state.columns[index].name;
              })
              .filter(isNotNull),
          ];
        }
      } else {
        const index = columns.findIndex((col) => col.name === originalValue);

        if (!state.columns[index]) {
          return;
        }

        return [setting, state.columns[index].name];
      }
    })
    .filter(isNotNull);

  state.settings = {
    ...updateVizSettingsWithRefs(card.visualization_settings, columnsToRefs),
    ...Object.fromEntries(entries),
  };

  return state;
}
