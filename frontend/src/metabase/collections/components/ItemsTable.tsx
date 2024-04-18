import PropTypes from "prop-types";

import PinDropZone from "metabase/collections/components/PinDropZone";
import CS from "metabase/css/core/index.css";

import BaseItemsTable, { type ListableItem } from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

const Item = ({
  item,
  ...props
}: {
  item: ListableItem; // FIXME:
} & BaseItemsTable.ItemProps) => {
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
}: { items: ListableItem[] } & BaseItemsTableProps) => {
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
      <BaseItemsTable {...props} renderItem={Item} />
    </div>
  );
};

export default ItemsTable;
