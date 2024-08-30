import { type PropsWithChildren } from "react";

import { useSelector } from "metabase/lib/redux";
import { getIsDndAvailable } from "metabase/selectors/app";

import type { BaseItemsTableProps } from "metabase/components/ItemsTable/BaseItemsTable";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import type { CollectionItem } from "metabase-types/api";

// TODO: reduce props to what are actually needed
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
    | "databases"
    | "bookmarks"
    | "createBookmark"
    | "deleteBookmark"
    | "onCopy"
    | "onMove"
    | "onToggleSelected"
    | "onClick"
    | "showActionMenu"
  >
>;

export const TableRow = ({
  collection,
  isSelected,
  item,
  itemKey,
  onDrop,
  selectedItems,
  testIdPrefix,
  children,
}: BaseItemTableRowProps) => {
  const isDndAvailable = useSelector(getIsDndAvailable);

  const tr = (
    <tr key={itemKey} data-testid={testIdPrefix} style={{ height: 48 }}>
      {children}
    </tr>
  );

  if (isDndAvailable) {
    return (
      <ItemDragSource
        item={item}
        collection={collection}
        isSelected={isSelected}
        selected={selectedItems}
        onDrop={onDrop}
        key={`item-drag-source-${itemKey}`}
      >
        {tr}
      </ItemDragSource>
    );
  }

  return tr;
};
