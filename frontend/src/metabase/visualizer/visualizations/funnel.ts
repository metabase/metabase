import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  copyColumn,
  createDataSourceNameRef,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

export const funnelDropHandler = (
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

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    let metricColumnName = state.settings["funnel.metric"];
    let dimensionColumnName = state.settings["funnel.dimension"];

    if (!metricColumnName) {
      const nameIndex = state.columns.length + 1;
      metricColumnName = `COLUMN_${nameIndex}`;
      state.columns.push(copyColumn(metricColumnName, column));
      state.settings["funnel.metric"] = metricColumnName;
    }
    if (!dimensionColumnName) {
      const nameIndex = state.columns.length + 1;
      dimensionColumnName = `COLUMN_${nameIndex}`;
      state.columns.push(createDimensionColumn(dimensionColumnName));
      state.settings["funnel.dimension"] = dimensionColumnName;
    }

    state.columnValuesMapping[metricColumnName] = addColumnMapping(
      state.columnValuesMapping[metricColumnName],
      columnRef,
    );
    state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
      state.columnValuesMapping[dimensionColumnName],
      createDataSourceNameRef(dataSource.id),
    );
  }
};

function createDimensionColumn(name: string): DatasetColumn {
  return {
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    field_ref: ["field", name, { "base-type": "type/Text" }],
    source: "artificial",
  };
}
