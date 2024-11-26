import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  checkColumnMappingExists,
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

export const pieDropHandler = (
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

  if (over.id === DROPPABLE_ID.PIE_METRIC && isNumeric(column)) {
    let metricColumnName = state.settings["pie.metric"];

    if (!metricColumnName) {
      metricColumnName = columnRef.name;
      state.columns.push(copyColumn(metricColumnName, column));
    } else {
      const index = state.columns.findIndex(
        col => col.name === metricColumnName,
      );
      state.columns[index] = copyColumn(metricColumnName, column);
    }

    if (metricColumnName) {
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
    }
  }

  if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const dimensions = state.settings["pie.dimension"] ?? [];

    const newDimension = copyColumn(columnRef.name, column);
    state.columns.push(newDimension);
    state.columnValuesMapping[newDimension.name] = [columnRef];
    state.settings = {
      ...state.settings,
      "pie.dimension": [...dimensions, newDimension.name],
    };
  }
};

export function removeColumnFromPieChart(
  state: VisualizerHistoryItem,
  columnName: string,
  wellId: string,
) {
  if (
    wellId === DROPPABLE_ID.PIE_DIMENSION &&
    state.settings["pie.dimension"]
  ) {
    let dimensions = state.settings["pie.dimension"];
    if (!Array.isArray(dimensions)) {
      dimensions = [dimensions];
    }
    state.settings["pie.dimension"] = dimensions.filter(
      dimension => dimension !== columnName,
    );
  }

  if (wellId === DROPPABLE_ID.PIE_METRIC) {
    delete state.settings["pie.metric"];
  }
}
