import type { DropTargetMonitor } from "react-dnd";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/common/collections/utils";
import { isPinnable } from "metabase/common/hooks";

import { DropArea } from "./DropArea";

import { type ItemDragPayload, PinnableDragTypes } from ".";

interface PinDropTargetOwnProps {
  variant: "pin" | "unpin";
  pinIndex: number;
  noDrop: boolean;
}

export const PinDropTarget = DropTarget(
  PinnableDragTypes,
  {
    drop(props: PinDropTargetOwnProps) {
      if (!props.noDrop) {
        return { pinIndex: props.pinIndex };
      }
    },
    canDrop(props: PinDropTargetOwnProps, monitor: DropTargetMonitor) {
      // react-dnd v4 types the drag payload as `any`.
      const { items } = monitor.getItem() as ItemDragPayload;
      const { variant } = props;
      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (variant === "pin") {
        return items.every((item) => isPinnable(item) && !isItemPinned(item));
      } else if (variant === "unpin") {
        return items.every((item) => isPinnable(item) && isItemPinned(item));
      }

      return false;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
  // react-dnd v7 HOC types can't express the own/collected props split
)(DropArea as any);
