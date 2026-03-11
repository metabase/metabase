import type { PropsWithChildren } from "react";

import type { BaseItemsTableProps } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { DefaultItemRenderer } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import { ItemDragSource } from "metabase/common/components/dnd/ItemDragSource";
import type { CollectionItem } from "metabase-types/api";

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
  return (
    <ItemDragSource
      item={item}
      collection={collection}
      isSelected={isSelected}
      selected={selectedItems}
      onDrop={onDrop}
      key={`item-drag-source-${itemKey}`}
    >
      {/* We can't use <TableRow> due to React DnD throwing an error: Only native element nodes can now be passed to React DnD connectors. */}
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
    </ItemDragSource>
  );
};
