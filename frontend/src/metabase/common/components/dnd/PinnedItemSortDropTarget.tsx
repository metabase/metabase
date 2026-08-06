import type { DropTargetMonitor } from "react-dnd";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/common/collections/utils";
import { isPinnable } from "metabase/common/hooks";

import { DropArea } from "./DropArea";

import { PinnableDragTypes, isItemDragPayload } from ".";

interface PinnedItemSortDropTargetOwnProps {
  isFrontTarget: boolean;
  isBackTarget: boolean;
  pinIndex: number;
  noDrop: boolean;
}

export const PinnedItemSortDropTarget = DropTarget(
  PinnableDragTypes,
  {
    drop(props: PinnedItemSortDropTargetOwnProps) {
      if (!props.noDrop) {
        return { pinIndex: props.pinIndex };
      }
    },
    canDrop(
      props: PinnedItemSortDropTargetOwnProps,
      monitor: DropTargetMonitor,
    ) {
      const payload = monitor.getItem();
      if (!isItemDragPayload(payload)) {
        return false;
      }
      const { items } = payload;
      const { isFrontTarget, isBackTarget, pinIndex } = props;

      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (!items.every((item) => isPinnable(item) && isItemPinned(item))) {
        return false;
      }

      if (pinIndex == null) {
        return false;
      }

      if (isFrontTarget) {
        return items.every(
          (item) =>
            item.collection_position != null &&
            pinIndex < item.collection_position,
        );
      } else if (isBackTarget) {
        return items.every(
          (item) =>
            item.collection_position != null &&
            pinIndex > item.collection_position,
        );
      }

      return false;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
  // react-dnd v4 HOC types can't express the own/collected props split
)(DropArea as any);
