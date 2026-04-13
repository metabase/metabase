import type { DropTargetMonitor } from "react-dnd";
import { DropTarget } from "react-dnd";

import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/collections/utils";
import type { Collection, CollectionItem } from "metabase-types/api";

import { DropArea } from "./DropArea";

import { MoveableDragTypes } from ".";

interface CollectionDropTargetOwnProps {
  collection: Collection;
}

export const CollectionDropTarget = DropTarget(
  MoveableDragTypes,
  {
    drop(props: CollectionDropTargetOwnProps) {
      return { collection: props.collection };
    },
    canDrop(props: CollectionDropTargetOwnProps, monitor: DropTargetMonitor) {
      const { collection } = props;
      const { item } = monitor.getItem() as { item: CollectionItem };
      if (
        !isRootTrashCollection(collection) &&
        collection.can_write === false
      ) {
        return false;
      }
      const droppingToTrashFromTrash =
        isRootTrashCollection(collection) && item.archived;
      const droppingToSameCollection =
        canonicalCollectionId(item.collection_id) ===
        canonicalCollectionId(collection.id);
      return (
        item.model !== "collection" &&
        !droppingToSameCollection &&
        !droppingToTrashFromTrash
      );
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
  // react-dnd v7 HOC types can't express the own/collected props split
)(DropArea as any);
