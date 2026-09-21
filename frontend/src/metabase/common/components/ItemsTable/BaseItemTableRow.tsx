import cx from "classnames";
import type { MouseEvent, PropsWithChildren } from "react";

import type { BaseItemsTableProps } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { DefaultItemRenderer } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import { canSelectItems } from "metabase/common/components/ItemsTable/utils";
import {
  type CollectionDropTargetRenderProps,
  CollectionRowDropTarget,
} from "metabase/common/components/dnd/CollectionDropTarget";
import { ItemDragSource } from "metabase/common/components/dnd/ItemDragSource";
import type { CollectionItem } from "metabase-types/api";

import S from "./BaseItemTableRow.module.css";

export type ItemTableRowDndState =
  | "idle"
  | "dragged"
  | "disabled"
  | "drop-target"
  | "drop-target-hovered";

export function getItemTableRowDndState({
  isDragActive,
  isDragged,
  highlighted,
  hovered,
}: Omit<
  CollectionDropTargetRenderProps,
  "connectDropTarget"
>): ItemTableRowDndState {
  switch (true) {
    case !isDragActive:
      return "idle";
    case isDragged:
      return "dragged";
    case hovered:
      return "drop-target-hovered";
    case highlighted:
      return "drop-target";
    default:
      return "disabled";
  }
}

type BaseItemTableRowProps = PropsWithChildren<
  {
    testIdPrefix: string;
    itemKey: string;
    item: CollectionItem;
    isSelected: boolean;
  } & Pick<
    BaseItemsTableProps,
    | "items"
    | "getIsSelected"
    | "isPinned"
    | "collection"
    | "selectedItems"
    | "onDrop"
    | "ItemComponent"
    | "databases"
    | "bookmarks"
    | "createBookmark"
    | "deleteBookmark"
    | "onCopy"
    | "onMove"
    | "onToggleSelected"
    | "onClick"
    | "visibleColumnsMap"
  >
>;

const getRowShiftSelectHandler = ({
  item,
  collection,
  onToggleSelected,
}: Pick<BaseItemTableRowProps, "item" | "collection" | "onToggleSelected">) => {
  if (!canSelectItems(collection, onToggleSelected)) {
    return undefined;
  }

  return (event: MouseEvent<HTMLTableRowElement>) => {
    if (!event.shiftKey) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("[data-ignore-row-selection]")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    document.getSelection()?.removeAllRanges();
    onToggleSelected?.(item);
  };
};

export const TableRow = ({
  testIdPrefix,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  ItemComponent = DefaultItemRenderer,
  isPinned,
  onCopy,
  onMove,
  onToggleSelected,
  item,
  isSelected,
  itemKey,
  collection,
  onClick,
  visibleColumnsMap,
}: BaseItemTableRowProps) => (
  <tr
    key={itemKey}
    data-testid={testIdPrefix}
    style={{ height: 48 }}
    onClickCapture={getRowShiftSelectHandler({
      item,
      collection,
      onToggleSelected,
    })}
  >
    <ItemComponent
      onClick={onClick}
      testIdPrefix={testIdPrefix}
      item={item}
      isSelected={isSelected}
      databases={databases}
      bookmarks={bookmarks}
      createBookmark={createBookmark}
      deleteBookmark={deleteBookmark}
      collection={collection}
      isPinned={isPinned}
      onCopy={onCopy}
      onMove={onMove}
      onToggleSelected={onToggleSelected}
      visibleColumnsMap={visibleColumnsMap}
    />
  </tr>
);

export const ItemDragSourceTableRow = ({
  testIdPrefix,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  ItemComponent = DefaultItemRenderer,
  isPinned,
  onCopy,
  onMove,
  onToggleSelected,
  item,
  isSelected,
  collection,
  onClick,
  selectedItems,
  onDrop,
  visibleColumnsMap,
}: BaseItemTableRowProps) => {
  const renderDraggableRow = (
    dropTargetProps: CollectionDropTargetRenderProps,
  ) => {
    const dndState = getItemTableRowDndState(dropTargetProps);
    const row = (
      // We can't use <TableRow> due to React DnD throwing an error: Only native element nodes can now be passed to React DnD connectors.
      <tr
        data-dnd-state={dndState}
        data-testid={testIdPrefix}
        style={{ height: 48 }}
        className={cx({
          [S.draggedRow]: dndState === "dragged",
          [S.disabledRow]: dndState === "disabled",
          [S.dropTargetRow]: dndState === "drop-target-hovered",
        })}
        onClickCapture={getRowShiftSelectHandler({
          item,
          collection,
          onToggleSelected,
        })}
      >
        <ItemComponent
          testIdPrefix={testIdPrefix}
          item={item}
          isSelected={isSelected}
          databases={databases}
          bookmarks={bookmarks}
          createBookmark={createBookmark}
          deleteBookmark={deleteBookmark}
          collection={collection}
          isPinned={isPinned}
          onCopy={onCopy}
          onMove={onMove}
          onToggleSelected={onToggleSelected}
          onClick={onClick}
          visibleColumnsMap={visibleColumnsMap}
        />
      </tr>
    );
    const dropTargetRow = dropTargetProps.connectDropTarget(row);

    if (item.model === "collection") {
      return dropTargetRow;
    }

    return (
      <ItemDragSource
        item={item}
        collection={collection}
        isSelected={isSelected}
        selected={selectedItems}
        onDrop={onDrop}
      >
        {dropTargetRow}
      </ItemDragSource>
    );
  };

  const isDroppableCollectionRow =
    item.model === "collection" && !item.archived;

  return (
    <CollectionRowDropTarget
      collection={item}
      isDropTarget={isDroppableCollectionRow}
      item={item}
    >
      {renderDraggableRow}
    </CollectionRowDropTarget>
  );
};
