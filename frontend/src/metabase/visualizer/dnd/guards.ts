import type { Active } from "@dnd-kit/core";

import { DRAGGABLE_ID } from "./constants";
import type { DraggedColumn, DraggedItem } from "./types";

export function isDraggedColumnItem(item: Active): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isValidDraggedItem(item: Active): item is DraggedItem {
  return isDraggedColumnItem(item);
}
