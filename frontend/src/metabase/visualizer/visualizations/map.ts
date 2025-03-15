import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

export const mapDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.MAP_METRIC && isNumeric(column)) {
    let metricColumnName = state.settings["map.metric"];

    if (!metricColumnName) {
      metricColumnName = columnRef.name;
      state.columns.push(
        copyColumn(metricColumnName, column, dataSource.name, state.columns),
      );
    } else {
      const index = state.columns.findIndex(
        col => col.name === metricColumnName,
      );
      state.columns[index] = copyColumn(
        metricColumnName,
        column,
        dataSource.name,
        state.columns,
      );
    }

    if (metricColumnName) {
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
    }
  }

  if (over.id === DROPPABLE_ID.MAP_DIMENSION) {
    if (state.settings["map.dimension"]?.name === columnRef.name) {
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
      "map.dimension": newDimension.name,
    };
  }

  if (over.id === DROPPABLE_ID.MAP_LATITUDE) {
    if (state.settings["map.latitude"]?.name === columnRef.name) {
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
      "map.latitude": newDimension.name,
    };
  }

  if (over.id === DROPPABLE_ID.MAP_LONGITUDE) {
    if (state.settings["map.longitude"]?.name === columnRef.name) {
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
      "map.longitude": newDimension.name,
    };
  }
};

export function removeColumnFromMap(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  if (state.settings["map.metric"] === columnName) {
    delete state.settings["map.metric"];
  }

  if (state.settings["map.dimension"] === columnName) {
    delete state.settings["map.dimension"];
  }

  if (state.settings["map.latitude"] === columnName) {
    delete state.settings["map.latitude"];
  }

  if (state.settings["map.longitude"] === columnName) {
    delete state.settings["map.longitude"];
  }
}
