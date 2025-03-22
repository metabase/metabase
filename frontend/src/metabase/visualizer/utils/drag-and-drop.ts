import type { Active } from "@dnd-kit/core";

import type {
  DraggedColumn,
  DraggedItem,
  DraggedWellItem,
} from "metabase-types/store/visualizer";

import { DRAGGABLE_ID } from "../constants";

type DndItem = Omit<Active, "rect">;

export function isDraggedColumnItem(item: DndItem): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isDraggedWellItem(item: DndItem): item is DraggedWellItem {
  return item.data?.current?.type === DRAGGABLE_ID.WELL_ITEM;
}

export function isValidDraggedItem(item: DndItem): item is DraggedItem {
  return isDraggedColumnItem(item) || isDraggedWellItem(item);
}
