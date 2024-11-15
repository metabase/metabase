import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  createVisualizerColumnReference,
  cloneColumnProperties,
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
  console.log("pieDropHandler", state, active, over);

  const { column, dataSource } = active.data.current;
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.PIE_METRIC && isNumeric(column)) {
    const metricColumnName = state.settings["pie.metric"];
    // console.log(metricColumnName);
    // console.log(columnRef);
    if (metricColumnName) {
      const idx = state.columns.findIndex(col => col.name === "METRIC_1");
      state.columns[idx] = cloneColumnProperties(state.columns[idx], column);
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
    }
  }
  //
  if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
    const [dimensionColumnName] = state.settings["pie.dimension"] ?? [];
    console.log(dimensionColumnName);
    if (dimensionColumnName) {
      const idx = state.columns.findIndex(col => col.name === "DIMENSION_1");
      state.columns[idx] = cloneColumnProperties(state.columns[idx], column);
      state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
        state.columnValuesMapping[dimensionColumnName],
        columnRef,
      );
    }
  }
};
