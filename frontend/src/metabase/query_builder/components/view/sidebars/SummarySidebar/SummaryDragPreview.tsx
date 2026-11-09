import { DragOverlay } from "@dnd-kit/core";
import { createPortal } from "react-dom";

import { Box } from "metabase/ui";

import S from "./SummarySidebar.module.css";
import type { SummaryDragItem } from "./types";
import { getDragItemLabel } from "./utils";

type SummaryDragPreviewProps = {
  draggedItem: SummaryDragItem | null;
};

export function SummaryDragPreview({ draggedItem }: SummaryDragPreviewProps) {
  // in the body, so the panel's clipping doesn't cut the preview off
  return createPortal(
    <DragOverlay dropAnimation={null}>
      {draggedItem && (
        <Box className={S.dragPreview} data-testid="summary-drag-preview">
          {getDragItemLabel(draggedItem)}
        </Box>
      )}
    </DragOverlay>,
    document.body,
  );
}
