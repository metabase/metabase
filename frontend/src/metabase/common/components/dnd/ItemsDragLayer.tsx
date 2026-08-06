import { Component } from "react";
import { DragLayer, type XYCoord } from "react-dnd";
import { msgid, ngettext } from "ttag";

import { Box, Paper, Portal, Text } from "metabase/ui";

import S from "./ItemsDragLayer.module.css";

import { isItemDragPayload } from ".";

interface ItemsDragLayerInnerProps {
  isDragging: boolean;
  currentOffset: XYCoord | null;
  payload: unknown;
}

export function MoveItemsDragPreview({ count }: { count: number }) {
  return (
    <Paper
      bg="background_surface-brand-subtle"
      className={S.preview}
      data-testid="items-drag-preview"
      px="md"
      py="sm"
      radius="sm"
      shadow="md"
      withBorder
    >
      <Text fw={700}>
        {ngettext(msgid`Move ${count} item`, `Move ${count} items`, count)}
      </Text>
    </Paper>
  );
}

export class ItemsDragLayerInner extends Component<ItemsDragLayerInnerProps> {
  render() {
    const { isDragging, currentOffset, payload } = this.props;

    if (!isDragging || !currentOffset || !isItemDragPayload(payload)) {
      return null;
    }

    return (
      <Portal>
        <Box
          aria-hidden
          className={S.dragLayer}
          style={{
            transform: `translate3d(${currentOffset.x + 12}px, ${
              currentOffset.y + 12
            }px, 0)`,
          }}
        >
          <MoveItemsDragPreview count={payload.items.length} />
        </Box>
      </Portal>
    );
  }
}

export const ItemsDragLayer = DragLayer((monitor) => ({
  payload: monitor.getItem(),
  currentOffset: monitor.getClientOffset(),
  isDragging: monitor.isDragging(),
  // react-dnd v4 HOC types can't express the own/collected props split
}))(ItemsDragLayerInner as any);
