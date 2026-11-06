import { DragOverlay, useDndContext } from "@dnd-kit/core";
import { createPortal } from "react-dom";

import { Box } from "metabase/ui";

import S from "./SummarySidebar.module.css";
import { getDragItem, getDragItemLabel } from "./utils";

export function SummaryDragPreview() {
  const { active } = useDndContext();
  const drag = getDragItem(active?.data.current);
  // in the body, so the panel's clipping doesn't cut the preview off
  return createPortal(
    <DragOverlay dropAnimation={null}>
      {drag && (
        <Box className={S.dragPreview} data-testid="summary-drag-preview">
          {getDragItemLabel(drag)}
        </Box>
      )}
    </DragOverlay>,
    document.body,
  );
}
