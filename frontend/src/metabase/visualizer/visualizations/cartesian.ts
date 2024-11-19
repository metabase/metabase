import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  checkColumnMappingExists,
  cloneColumnProperties,
  createDimensionColumn,
  createMetricColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

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

      if (nextDimensions.length === 0) {
        const newDimension = createDimensionColumn();
        state.columns.push(newDimension);
        nextDimensions.push(newDimension.name);
      }

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

      if (nextMetrics.length === 0) {
        const newMetric = createMetricColumn();
        state.columns.push(newMetric);
        nextMetrics.push(newMetric.name);
      }

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
    const dimensions = state.settings["graph.dimensions"] ?? [];

    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const nameIndex = state.columns.length + 1;
    const newDimension = cloneColumnProperties(
      createDimensionColumn({ name: `COLUMN_${nameIndex}` }),
      column,
    );
    state.columns.push(newDimension);
    state.columnValuesMapping[newDimension.name] = [columnRef];
    state.settings = {
      ...state.settings,
      "graph.dimensions": [...dimensions, newDimension.name],
    };
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    const metrics = state.settings["graph.metrics"] ?? [];

    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const nameIndex = state.columns.length + 1;
    const newMetric = cloneColumnProperties(
      createMetricColumn({ name: `COLUMN_${nameIndex}` }),
      column,
    );
    state.columns.push(newMetric);
    state.columnValuesMapping[newMetric.name] = [columnRef];
    state.settings = {
      ...state.settings,
      "graph.metrics": [...metrics, newMetric.name],
    };
  }

  // TODO
  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    state.columnValuesMapping["BUBBLE_SIZE"] = [columnRef];
  }
};
