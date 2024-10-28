import { Flex } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/dnd/constants";
import type { DraggedItem } from "metabase-types/store/visualizer";

import { ColumnListItem } from "../DataManager";

interface DragOverlayProps {
  item: DraggedItem;
}

export function DragOverlay({ item }: DragOverlayProps) {
  if (item.data.current.type === DRAGGABLE_ID.COLUMN) {
    return (
      <Flex
        bg="#F8FBFE"
        style={{
          border: "2px solid #358CD9",
          borderRadius: "var(--default-border-radius)",
          boxShadow: "0px 1px 4px 1px rgba(0, 0, 0, 0.2)",
          cursor: "grab",
        }}
        align="center"
      >
        <ColumnListItem column={item.data.current.column} />
      </Flex>
    );
  }
  return null;
}
