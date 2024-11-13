import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { getReferencedColumns } from "metabase/visualizer/selectors";
import {
  addColumnMapping,
  createDataSourceNameRef,
  createVisualizerColumnReference,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { VisualizerState } from "metabase-types/store/visualizer";

export const funnelDropHandler = (
  state: VisualizerState,
  { active, over }: DragEndEvent,
) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    getReferencedColumns({ visualizer: state }),
  );

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    const metricColumnName = state.settings["funnel.metric"];
    const dimensionColumnName = state.settings["funnel.dimension"];
    if (metricColumnName && dimensionColumnName) {
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
      state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
        state.columnValuesMapping[dimensionColumnName],
        createDataSourceNameRef(dataSource.id),
      );
    }
  }
};
