import type { ReactNode } from "react";

import { Box, type BoxProps, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { DraggedItem } from "metabase-types/store/visualizer";

import { ColumnListItem } from "../DataManager";
import { WellItem } from "../VisualizationCanvas/WellItem";

interface DragOverlayProps {
  item: DraggedItem;
}

export function DragOverlay({ item }: DragOverlayProps) {
  if (isDraggedColumnItem(item)) {
    return (
      <DragOverlayWrapper // FIX
        style={{ borderRadius: "var(--default-border-radius)" }}
      >
        <ColumnListItem column={item.data.current.column} />
      </DragOverlayWrapper>
    );
  }
  if (isDraggedWellItem(item)) {
    const { column, wellId } = item.data.current;
    const isVertical = wellId === DROPPABLE_ID.Y_AXIS_WELL;
    return (
      <DragOverlayWrapper
        miw="140px"
        style={{
          borderRadius: "var(--border-radius-xl)",
          transform: isVertical ? "rotate(-90deg)" : undefined,
        }}
      >
        <WellItem>
          <Text>{column.display_name}</Text>
        </WellItem>
      </DragOverlayWrapper>
    );
  }
  return null;
}

interface DragOverlayWrapperProps extends BoxProps {
  children: ReactNode;
}

function DragOverlayWrapper({ style, ...props }: DragOverlayWrapperProps) {
  return (
    <Box
      {...props}
      bg="#F8FBFE"
      style={{
        ...style,
        border: "2px solid #358CD9",
        boxShadow: "0px 1px 4px 1px rgba(0, 0, 0, 0.2)",
        cursor: "grab",
      }}
    />
  );
}
