import PinDropZone from "metabase/collections/components/PinDropZone";
import CS from "metabase/css/core/index.css";
import type { CollectionItem } from "metabase-types/api";

import type { BaseItemsTableProps, ItemRendererProps } from "./BaseItemsTable";
import { BaseItemsTable } from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

const Item = ({
  item,
  ...props
}: {
  item: CollectionItem;
} & ItemRendererProps) => {
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
    />
  );
};

export const ItemsTable = ({
  items,
  ItemComponent = Item,
  ...props
}: {
  items: CollectionItem[];
  ItemComponent?: (props: ItemRendererProps) => JSX.Element;
} & BaseItemsTableProps) => {
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
      <BaseItemsTable items={items} {...props} ItemComponent={ItemComponent} />
    </div>
  );
};
