import type { DropTargetMonitor } from "react-dnd";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/collections/utils";
import type { CollectionItem } from "metabase-types/api";

import { DropArea } from "./DropArea";

import { PinnableDragTypes } from ".";

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
      const { item } = monitor.getItem() as { item: CollectionItem };
      const { variant } = props;
      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (variant === "pin") {
        return !isItemPinned(item);
      } else if (variant === "unpin") {
        return isItemPinned(item);
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
