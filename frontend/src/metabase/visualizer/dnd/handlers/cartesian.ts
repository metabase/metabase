import { importColumn } from "../../visualizer.slice";
import { DROPPABLE_ID } from "../constants";
import { isDraggedColumnItem } from "../guards";

import type { VizDropHandlerOpts } from "./types";

export function cartesianDropHandler({ event, dispatch }: VizDropHandlerOpts) {
  const { active, over } = event;
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }
  const { column, dataSource } = active.data.current;
  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    dispatch(
      importColumn({ column, dataSource, context: DROPPABLE_ID.X_AXIS_WELL }),
    );
  } else if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    dispatch(
      importColumn({ column, dataSource, context: DROPPABLE_ID.Y_AXIS_WELL }),
    );
  }
}
