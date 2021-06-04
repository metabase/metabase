import React, { useCallback } from "react";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

function ItemsTable(props) {
  const renderItem = useCallback(
    ({ item, ...itemProps }) => (
      <BaseItemsTable.Item
        key={`${item.model}-${item.id}`}
        {...itemProps}
        item={item}
        linkProps={{
          "data-metabase-event": `${ANALYTICS_CONTEXT};Item Click;${item.model}`,
        }}
      />
    ),
    [],
  );

  return <BaseItemsTable {...props} renderItem={renderItem} />;
}

export default ItemsTable;
