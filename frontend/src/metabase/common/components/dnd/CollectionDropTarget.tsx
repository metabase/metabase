import type { ComponentType, ReactElement } from "react";
import { Component } from "react";
import type {
  ConnectDropTarget,
  DropTargetConnector,
  DropTargetMonitor,
} from "react-dnd";
import { DropTarget } from "react-dnd";

import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import type { Collection, CollectionItem } from "metabase-types/api";

import { DropArea } from "./DropArea";

import { MoveableDragTypes } from ".";

export type DropTargetCollection = Pick<Collection, "id"> &
  Partial<Pick<CollectionItem, "type" | "can_write">>;

interface CollectionDropTargetOwnProps {
  collection: DropTargetCollection;
  selectedItems?: CollectionItem[];
}

export function canDropItemIntoCollection({
  item,
  collection,
  selectedItems,
}: CollectionDropTargetOwnProps & { item: CollectionItem }): boolean {
  const isTrashCollection = isRootTrashCollection(collection);
  if (!isTrashCollection && collection.can_write === false) {
    return false;
  }
  const droppingToTrashFromTrash = isTrashCollection && item.archived;
  const droppingToSameCollection =
    canonicalCollectionId(item.collection_id) ===
    canonicalCollectionId(collection.id);
  // every selected item gets moved on drop, so the target must not be among them
  const droppingIntoDraggedCollection = Boolean(
    selectedItems?.some(
      (selectedItem) =>
        selectedItem.model === "collection" &&
        selectedItem.id === collection.id,
    ),
  );
  return (
    item.model !== "collection" &&
    !droppingToSameCollection &&
    !droppingToTrashFromTrash &&
    !droppingIntoDraggedCollection
  );
}

const dropTargetSpec = {
  drop(props: CollectionDropTargetOwnProps) {
    return { collection: props.collection };
  },
  canDrop(props: CollectionDropTargetOwnProps, monitor: DropTargetMonitor) {
    // react-dnd v4 types the drag payload as `any`; beginDrag provides `{ item }`
    const { item } = monitor.getItem() as { item: CollectionItem };
    return canDropItemIntoCollection({
      item,
      collection: props.collection,
      selectedItems: props.selectedItems,
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
}

interface CollectionRowDropTargetProps extends CollectionDropTargetOwnProps {
  children: (props: CollectionDropTargetRenderProps) => ReactElement;
}

class CollectionRowDropTargetInner extends Component<
  CollectionRowDropTargetProps & CollectionDropTargetRenderProps
> {
  render() {
    const { children, connectDropTarget, hovered, highlighted } = this.props;
    return children({ connectDropTarget, hovered, highlighted });
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
    collectDropTarget,
    // react-dnd v4 HOC types can't express the own/collected props split
  )(CollectionRowDropTargetInner as any);
