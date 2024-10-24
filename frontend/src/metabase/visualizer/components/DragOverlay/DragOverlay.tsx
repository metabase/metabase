import { DRAGGABLE_ID } from "metabase/visualizer/dnd/constants";
import type { DraggedItem } from "metabase/visualizer/dnd/types";

import { ColumnListItem } from "../DataManager";

interface DragOverlayProps {
  item: DraggedItem;
}

export function DragOverlay({ item }: DragOverlayProps) {
  if (item.data.current.type === DRAGGABLE_ID.COLUMN) {
    return <ColumnListItem column={item.data.current.column} />;
  }
  return null;
}
