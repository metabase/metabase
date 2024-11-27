import {
  ItemDragSourceTableRow,
  TableRow,
} from "metabase/components/ItemsTable/BaseItemTableRow";
import type { BaseItemsTableProps } from "metabase/components/ItemsTable/BaseItemsTable";
import { DefaultItemRenderer } from "metabase/components/ItemsTable/DefaultItemRenderer";
import { useSelector } from "metabase/lib/redux";
import { getIsDndAvailable } from "metabase/selectors/app";
import type { CollectionItem } from "metabase-types/api";

import { TBody } from "../BaseItemsTable.styled";

export const BaseItemsTableBody = ({
  items,
  getIsSelected = () => false,
  isPinned,
  collection,
  selectedItems,
  onDrop,
  ItemComponent = DefaultItemRenderer,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  onCopy,
  onMove,
  onToggleSelected,
  onClick,
  visibleColumnsMap,
}: Pick<
  BaseItemsTableProps,
  | "onClick"
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
  | "visibleColumnsMap"
>) => {
  const isDndAvailable = useSelector(getIsDndAvailable);

  const TableRowComponent = isDndAvailable ? ItemDragSourceTableRow : TableRow;
  return (
    <TBody>
      {items.map((item: CollectionItem) => {
        const isSelected = getIsSelected(item);

        const testIdPrefix = `${isPinned ? "pinned-" : ""}collection-entry`;
        const itemKey = `${item.model}-${item.id}`;

        return (
          <TableRowComponent
            key={itemKey}
            itemKey={itemKey}
            testIdPrefix={testIdPrefix}
            item={item}
            isSelected={isSelected}
            selectedItems={selectedItems}
            onDrop={onDrop}
            collection={collection}
            ItemComponent={ItemComponent}
            databases={databases}
            bookmarks={bookmarks}
            createBookmark={createBookmark}
            deleteBookmark={deleteBookmark}
            onCopy={onCopy}
            onMove={onMove}
            onToggleSelected={onToggleSelected}
            items={items}
            onClick={onClick}
            visibleColumnsMap={visibleColumnsMap}
          />
        );
      })}
    </TBody>
  );
};
