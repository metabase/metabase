import React, { useCallback } from "react";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

function PinnedItemsTable(props) {
  const renderItem = useCallback(
    ({ item, ...itemProps }) => (
      <BaseItemsTable.Item
        key={`${item.model}-${item.id}`}
        {...itemProps}
        item={item}
        linkProps={{
          "data-metabase-event": `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`,
        }}
      />
    ),
    [],
  );

  return (
    <BaseItemsTable
      {...props}
      isPinned
      renderItem={renderItem}
      data-testid="pinned-items"
    />
  );
}

export default PinnedItemsTable;
