import React from "react";

import VirtualizedList, {
  VirtualizedListProps,
} from "metabase/components/VirtualizedList";
import SelectList from "metabase/components/SelectList";

const SELECT_LIST_ITEM_HEIGHT = 40;

type VirtualizedSelectListProps<Item> = Omit<
  VirtualizedListProps<Item>,
  "rowHeight" | "role"
>;

function VirtualizedSelectList<Item>(props: VirtualizedSelectListProps<Item>) {
  return (
    <VirtualizedList<Item>
      data-testid="select-list"
      {...props}
      role="menu"
      rowHeight={SELECT_LIST_ITEM_HEIGHT}
    />
  );
}

export default Object.assign(VirtualizedSelectList, {
  Item: SelectList.Item,
});
