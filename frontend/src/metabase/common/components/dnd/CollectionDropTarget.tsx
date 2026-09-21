import type { ComponentType, ReactElement } from "react";
import { Component } from "react";
import type {
  ConnectDropTarget,
  DropTargetConnector,
  DropTargetMonitor,
} from "react-dnd";
import { DropTarget } from "react-dnd";

import {
  canPlaceEntityInCollection,
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { isMovable } from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

import { DropArea } from "./DropArea";

import { MoveableDragTypes, isItemDragPayload } from ".";

const EMPTY_DRAGGED_ITEMS: CollectionItem[] = [];

export type DropTargetCollection = Pick<Collection, "id"> &
  Partial<Pick<CollectionItem, "type" | "can_write">>;

interface CollectionDropTargetOwnProps {
  collection: DropTargetCollection;
  isDropTarget?: boolean;
}

/** Strips card subtypes from the overloaded `CollectionItem.type` field. */
function getDropTargetCollectionType(
  collection: DropTargetCollection,
): Collection["type"] {
  if (
    collection.type === "metric" ||
    collection.type === "model" ||
    collection.type === "question"
  ) {
    return undefined;
  }
  return collection.type;
}

export function canDropItemsIntoCollection({
  items,
  collection,
}: CollectionDropTargetOwnProps & { items: CollectionItem[] }): boolean {
  if (items.length === 0) {
    return false;
  }

  const isTrashCollection = isRootTrashCollection(collection);
  if (!isTrashCollection && collection.can_write === false) {
    return false;
  }

  return items.every((item) => {
    const droppingToTrashFromTrash = isTrashCollection && item.archived;
    const droppingToSameCollection =
      canonicalCollectionId(item.collection_id) ===
      canonicalCollectionId(collection.id);

    return (
      isMovable(item) &&
      item.model !== "collection" &&
      canPlaceEntityInCollection(
        item.model,
        getDropTargetCollectionType(collection),
      ) &&
      !droppingToSameCollection &&
      !droppingToTrashFromTrash
    );
  });
}

const dropTargetSpec = {
  drop(props: CollectionDropTargetOwnProps) {
    return { collection: props.collection };
  },
  canDrop(props: CollectionDropTargetOwnProps, monitor: DropTargetMonitor) {
    if (props.isDropTarget === false) {
      return false;
    }

    const payload = monitor.getItem();
    if (!isItemDragPayload(payload)) {
      return false;
    }
    return canDropItemsIntoCollection({
      items: payload.items,
      collection: props.collection,
    });
  },
};

const collectDropTarget = (
  connect: DropTargetConnector,
  monitor: DropTargetMonitor,
) => ({
  highlighted: monitor.canDrop(),
  hovered: monitor.isOver() && monitor.canDrop(),
  connectDropTarget: connect.dropTarget(),
});

const collectCollectionRowDropTarget = (
  connect: DropTargetConnector,
  monitor: DropTargetMonitor,
) => {
  const payload = monitor.getItem();
  const isDragActive = isItemDragPayload(payload);

  return {
    ...collectDropTarget(connect, monitor),
    draggedItems: isDragActive ? payload.items : EMPTY_DRAGGED_ITEMS,
    isDragActive,
  };
};

export const CollectionDropTarget = DropTarget(
  MoveableDragTypes,
  dropTargetSpec,
  collectDropTarget,
  // react-dnd v4 HOC types can't express the own/collected props split
)(DropArea as any);

export interface CollectionDropTargetRenderProps {
  connectDropTarget: ConnectDropTarget;
  hovered: boolean;
  highlighted: boolean;
  isDragged: boolean;
  isDragActive: boolean;
}

interface CollectionRowDropTargetProps extends CollectionDropTargetOwnProps {
  item: CollectionItem;
  children: (props: CollectionDropTargetRenderProps) => ReactElement;
}

interface CollectionRowDropTargetCollectedProps extends Omit<
  CollectionDropTargetRenderProps,
  "isDragged"
> {
  draggedItems: CollectionItem[];
}

class CollectionRowDropTargetInner extends Component<
  CollectionRowDropTargetProps & CollectionRowDropTargetCollectedProps
> {
  render() {
    const {
      children,
      connectDropTarget,
      draggedItems,
      hovered,
      highlighted,
      isDragActive,
      item,
    } = this.props;
    const isDragged = draggedItems.some(
      (draggedItem) =>
        draggedItem.model === item.model && draggedItem.id === item.id,
    );

    return children({
      connectDropTarget,
      hovered,
      highlighted,
      isDragged,
      isDragActive,
    });
  }
}

/**
 * Renders no markup of its own: `children` must attach the received
 * `connectDropTarget` to a native element. Usable where `DropArea`'s
 * wrapper `<div>` would be invalid markup, such as around a table `<tr>`.
 */
export const CollectionRowDropTarget: ComponentType<CollectionRowDropTargetProps> =
  DropTarget(
    MoveableDragTypes,
    dropTargetSpec,
    collectCollectionRowDropTarget,
    // react-dnd v4 HOC types can't express the own/collected props split
  )(CollectionRowDropTargetInner as any);
