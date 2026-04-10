import type { DropTargetMonitor } from "react-dnd";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/collections/utils";
import type { CollectionItem } from "metabase-types/api";

import { DropArea } from "./DropArea";

import { PinnableDragTypes } from ".";

interface PinnedItemSortDropTargetOwnProps {
  isFrontTarget: boolean;
  isBackTarget: boolean;
  itemModel: string;
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
      const { item } = monitor.getItem() as { item: CollectionItem };
      const { isFrontTarget, isBackTarget, itemModel, pinIndex } = props;

      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (!isItemPinned(item)) {
        return false;
      }

      if (itemModel != null && item.model !== itemModel) {
        return false;
      }

      if (isFrontTarget) {
        const isInFrontOfItem =
          pinIndex != null &&
          item.collection_position != null &&
          pinIndex < item.collection_position;
        return isInFrontOfItem;
      } else if (isBackTarget) {
        const isBehindItem =
          pinIndex != null &&
          item.collection_position != null &&
          pinIndex > item.collection_position;
        return isBehindItem;
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
