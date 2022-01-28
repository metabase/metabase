import React from "react";
import PropTypes from "prop-types";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import PinDropZone from "metabase/collections/components/PinDropZone";

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

ItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function ItemsTable(props) {
  const { items } = props;

  if (items.length === 0) {
    return <PinDropZone variant="unpin" />;
  }

  return (
    <PinDropTarget variant="unpin">
      <BaseItemsTable {...props} renderItem={Item} />
    </PinDropTarget>
  );
}

export default ItemsTable;
