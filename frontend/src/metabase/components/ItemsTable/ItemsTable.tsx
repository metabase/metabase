import PinDropZone from "metabase/collections/components/PinDropZone";
import CS from "metabase/css/core/index.css";
import type { CollectionItem } from "metabase-types/api";

import type { BaseItemsTableProps } from "./BaseItemsTable";
import { BaseItemsTable } from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

export const ItemsTable = ({
  items,
  ...props
}: {
  items: CollectionItem[];
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
      <BaseItemsTable items={items} {...props} />
    </div>
  );
};
