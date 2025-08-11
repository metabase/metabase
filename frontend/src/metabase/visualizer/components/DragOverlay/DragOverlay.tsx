import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { DraggedItem } from "metabase-types/store/visualizer";

import { ColumnsListItem } from "../DataImporter/ColumnsList/ColumnsListItem";
import { WellItem } from "../VisualizationCanvas/wells/WellItem";

interface DragOverlayProps {
  item: DraggedItem;
}

export function DragOverlay({ item }: DragOverlayProps) {
  if (isDraggedColumnItem(item)) {
    return (
      <ColumnsListItem highlightedForDrag column={item.data.current.column} />
    );
  }
  if (isDraggedWellItem(item)) {
    const { column, wellId } = item.data.current;
    return (
      <WellItem
        h={28}
        vertical={wellId === DROPPABLE_ID.Y_AXIS_WELL}
        highlightedForDrag
      >
        {column.display_name}
      </WellItem>
    );
  }
  return null;
}
