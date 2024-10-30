import type { DragEndEvent } from "@dnd-kit/core";

import type { VisualizationDisplay } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { importColumn } from "../visualizer.slice";

import { DROPPABLE_ID } from "./constants";
import { isDraggedColumnItem } from "./guards";

type VizDropHandlerOpts = {
  event: DragEndEvent;
  dispatch: Dispatch;
};

type VizDropHandler = (opts: VizDropHandlerOpts) => void;

function funnelDropHandler({ event, dispatch }: VizDropHandlerOpts) {
  const { active, over } = event;
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }
  const { column, dataSource } = active.data.current;
  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    // dispatch(updateSettings({ "funnel.dimension": active.id }));
  } else if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    // dispatch(updateSettings({ "funnel.metric": active.id }));
  } else if (over.id === DROPPABLE_ID.CANVAS_MAIN) {
    dispatch(importColumn({ column, dataSource }));
  }
}

const handlers: Partial<Record<VisualizationDisplay, VizDropHandler>> = {
  funnel: funnelDropHandler,
};

export function handleVisualizerDragEnd(
  display: VisualizationDisplay,
  opts: VizDropHandlerOpts,
) {
  handlers[display]?.(opts);
}
