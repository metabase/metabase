import type { Active } from "@dnd-kit/core";

import type {
  DraggedColumn,
  DraggedItem,
} from "metabase-types/store/visualizer";

import { DRAGGABLE_ID } from "./constants";

type DndItem = Omit<Active, "rect">;

export function isDraggedColumnItem(item: DndItem): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isValidDraggedItem(item: DndItem): item is DraggedItem {
  return isDraggedColumnItem(item);
}
