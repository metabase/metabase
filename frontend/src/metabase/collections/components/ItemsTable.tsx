import PinDropZone from "metabase/collections/components/PinDropZone";
import CS from "metabase/css/core/index.css";
import type { CollectionItem } from "metabase-types/api";

import type { BaseItemsTableProps } from "./BaseItemsTable";
import BaseItemsTable from "./BaseItemsTable";
import type { BaseTableItemProps } from "./BaseTableItem";
import { ItemsTableRoot } from "./ItemsTable.styled";

const Item = ({
  item,
  ...props
}: {
  item: CollectionItem;
} & BaseTableItemProps) => {
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
    />
  );
};

const ItemsTable = ({
  items,
  ...props
}: { items: CollectionItem[] } & BaseItemsTableProps) => {
  if (items.length === 0) {
    return (
      <ItemsTableRoot>
        <PinDropZone variant="unpin" />
      </ItemsTableRoot>
    );
  }

  return (
    <div className={CS.relative}>
      <PinDropZone variant="unpin" />
      <BaseItemsTable items={items} {...props} renderItem={Item} />
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default ItemsTable;
