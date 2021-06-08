import React from "react";
import PropTypes from "prop-types";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

Item.propTypes = {
  item: PropTypes.object.isRequired,
};

function Item({ item, ...props }) {
  const metabaseEvent = `${ANALYTICS_CONTEXT};Item Click;${item.model}`;
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

function ItemsTable(props) {
  return <BaseItemsTable {...props} renderItem={Item} />;
}

export default ItemsTable;
