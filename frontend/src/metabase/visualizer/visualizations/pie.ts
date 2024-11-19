import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  checkColumnMappingExists,
  cloneColumnProperties,
  createDimensionColumn,
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
    const metricColumnName = state.settings["pie.metric"];
    if (metricColumnName) {
      const index = state.columns.findIndex(col => col.name === "METRIC_1");
      state.columns[index] = cloneColumnProperties(
        state.columns[index],
        column,
      );
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
    }
  }

  if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
    const dimensions = state.settings["pie.dimension"] ?? [];

    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const index = state.columns.findIndex(col => col.name === dimensions[0]);
    const dimension = state.columns[index];
    const isDimensionMappedToValues =
      state.columnValuesMapping[dimension.name]?.length > 0;

    if (dimensions.length === 1 && dimension && !isDimensionMappedToValues) {
      state.columns[index] = cloneColumnProperties(
        state.columns[index],
        column,
      );
      state.columnValuesMapping[dimension.name] = addColumnMapping(
        state.columnValuesMapping[dimension.name],
        columnRef,
      );
    } else {
      const nameIndex = dimensions.length + 1;
      const newDimension = cloneColumnProperties(
        createDimensionColumn({ name: `DIMENSION_${nameIndex}` }),
        column,
      );
      state.columns.push(newDimension);
      state.columnValuesMapping[newDimension.name] = [columnRef];
      state.settings = {
        ...state.settings,
        "pie.dimension": [...dimensions, newDimension.name],
      };
    }
  }
};
