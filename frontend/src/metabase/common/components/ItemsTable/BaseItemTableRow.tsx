import type { PropsWithChildren } from "react";

import type { BaseItemsTableProps } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { DefaultItemRenderer } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import CollectionDropTarget from "metabase/common/components/dnd/CollectionDropTarget";
import ItemDragSource from "metabase/common/components/dnd/ItemDragSource";
import type { Collection, CollectionItem } from "metabase-types/api";

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
  <tr key={itemKey} data-testid={testIdPrefix} style={{ height: 48 }}>
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
  itemKey,
  collection,
  onClick,
  selectedItems,
  onDrop,
  visibleColumnsMap,
}: BaseItemTableRowProps) => {
  const isCollection = item.model === "collection";

  const tableRow = (
    <tr key={itemKey} data-testid={testIdPrefix} style={{ height: 48 }}>
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

  const dragSource = (
    <ItemDragSource
      item={item}
      collection={collection}
      isSelected={isSelected}
      selected={selectedItems}
      onDrop={onDrop}
      key={`item-drag-source-${itemKey}`}
    >
      {/* We can't use <TableRow> due to React DnD throwing an error: Only native element nodes can now be passed to React DnD connectors. */}
      {tableRow}
    </ItemDragSource>
  );

  // Wrap collections with CollectionDropTarget to enable dropping items into them
  if (isCollection) {
    return (
      <CollectionDropTarget collection={item as unknown as Collection}>
        {(droppableProps: { hovered?: boolean; highlighted?: boolean }) =>
          dragSource
        }
      </CollectionDropTarget>
    );
  }

  return dragSource;
};
