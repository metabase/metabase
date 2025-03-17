import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  canCombineCard,
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { Card, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

export const cartesianDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
) => {
  if (!over) {
    return;
  }

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isDraggedWellItem(active)) {
    const { wellId, column } = active.data.current;

    if (wellId === DROPPABLE_ID.X_AXIS_WELL) {
      const dimensions = state.settings["graph.dimensions"] ?? [];
      const nextDimensions = dimensions.filter(
        dimension => dimension !== column.name,
      );

      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];

      state.settings = {
        ...state.settings,
        "graph.dimensions": nextDimensions,
      };
    }

    if (wellId === DROPPABLE_ID.Y_AXIS_WELL) {
      const metrics = state.settings["graph.metrics"] ?? [];
      const nextMetrics = metrics.filter(metric => metric !== column.name);

      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];

      state.settings = {
        ...state.settings,
        "graph.metrics": nextMetrics,
      };
    }
  }

  if (!isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;

  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
  }

  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    let bubbleColumnName = state.settings["scatter.bubble"];

    if (!bubbleColumnName) {
      bubbleColumnName = columnRef.name;
      state.columns.push(
        copyColumn(bubbleColumnName, column, dataSource.name, state.columns),
      );
      state.settings["scatter.bubble"] = bubbleColumnName;
    }

    state.columnValuesMapping[bubbleColumnName] = [columnRef];
  }
};

export function addMetricColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const metrics = state.settings["graph.metrics"] ?? [];
  const isInUse = metrics.includes(columnRef.name);
  if (isInUse) {
    return;
  }

  const newMetric = copyColumn(
    columnRef.name,
    column,
    dataSource.name,
    state.columns,
  );
  state.columns.push(newMetric);
  state.columnValuesMapping[newMetric.name] = [columnRef];
  state.settings = {
    ...state.settings,
    "graph.metrics": [...metrics, newMetric.name],
  };
}

export function addDimensionColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const dimensions = state.settings["graph.dimensions"] ?? [];
  const isInUse = dimensions.includes(columnRef.name);
  if (isInUse) {
    return;
  }

  const newDimension = copyColumn(
    columnRef.name,
    column,
    dataSource.name,
    state.columns,
  );
  state.columns.push(newDimension);
  state.columnValuesMapping[newDimension.name] = [columnRef];
  state.settings = {
    ...state.settings,
    "graph.dimensions": [...dimensions, newDimension.name],
  };
}

export function addColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  card?: Card,
) {
  if (!state.display || !["area", "bar", "line"].includes(state.display)) {
    return;
  }

  if (
    card &&
    canCombineCard(state.display, state.columns, state.settings, card)
  ) {
    const ownMetrics = state.settings["graph.metrics"] ?? [];
    const ownDimensions = state.settings["graph.dimensions"] ?? [];

    const metrics = card.visualization_settings["graph.metrics"] ?? [];
    const dimensions = card.visualization_settings["graph.dimensions"] ?? [];

    const isMetric = metrics.includes(columnRef.originalName);
    const isDimension = dimensions.includes(columnRef.originalName);

    if (isMetric) {
      state.settings["graph.metrics"] = [...ownMetrics, column.name];
    }

    if (isDimension) {
      state.settings["graph.dimensions"] = [...ownDimensions, column.name];
    }
  }
}

export function removeColumnFromCartesianChart(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  if (state.settings["graph.dimensions"]) {
    const dimensions = state.settings["graph.dimensions"];
    state.settings["graph.dimensions"] = dimensions.filter(
      dimension => dimension !== columnName,
    );
  }

  if (state.settings["graph.metrics"]) {
    const metrics = state.settings["graph.metrics"];
    state.settings["graph.metrics"] = metrics.filter(
      metric => metric !== columnName,
    );
  }

  if (state.settings["scatter.bubble"] === columnName) {
    delete state.settings["scatter.bubble"];
  }
}
