import React from "react";
import PropTypes from "prop-types";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

PinnedItem.propTypes = {
  item: PropTypes.object.isRequired,
};

function PinnedItem({ item, ...props }) {
  const metabaseEvent = `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`;
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
      linkProps={{
        "data-metabase-event": metabaseEvent,
      }}
    />
  );
}

function PinnedItemsTable(props) {
  return (
    <BaseItemsTable
      {...props}
      isPinned
      renderItem={PinnedItem}
      data-testid="pinned-items"
    />
  );
}

export default PinnedItemsTable;
