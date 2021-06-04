import React, { useCallback } from "react";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable, { BaseTableItem } from "./BaseItemsTable";

function ItemsTable(props) {
  const renderItem = useCallback(
    ({ item, ...itemProps }) => (
      <BaseTableItem
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
