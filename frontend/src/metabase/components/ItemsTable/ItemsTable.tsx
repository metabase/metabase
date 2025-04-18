import PinDropZone from "metabase/collections/components/PinDropZone";
import type { ItemRendererProps } from "metabase/components/ItemsTable/DefaultItemRenderer";
import CS from "metabase/css/core/index.css";
import type { CollectionItem } from "metabase-types/api";

import type { BaseItemsTableProps } from "./BaseItemsTable";
import { BaseItemsTable } from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

const Item = <SortColumn extends string>({
  item,
  ...props
}: {
  item: CollectionItem;
} & ItemRendererProps<SortColumn>) => {
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
    />
  );
};

export const ItemsTable = <SortColumn extends string>({
  items,
  ItemComponent = Item,
  ...props
}: {
  items: CollectionItem[];
  ItemComponent?: (props: ItemRendererProps<SortColumn>) => JSX.Element;
} & BaseItemsTableProps<SortColumn>) => {
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
