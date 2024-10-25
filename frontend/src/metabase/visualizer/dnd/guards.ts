import type { Active } from "@dnd-kit/core";

import type {
  DraggedColumn,
  DraggedItem,
} from "metabase-types/store/visualizer";

import { DRAGGABLE_ID } from "./constants";

export function isDraggedColumnItem(item: Active): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isValidDraggedItem(item: Active): item is DraggedItem {
  return isDraggedColumnItem(item);
}
