import React from "react";
import PropTypes from "prop-types";
import { Flex } from "grid-styled";

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
    return (
      <Flex className="relative" align="center" justify="center" p={4} m={2}>
        <PinDropZone variant="unpin" />
      </Flex>
    );
  }

  return (
    <div className="relative">
      <PinDropZone variant="unpin" />
      <BaseItemsTable {...props} renderItem={Item} />
    </div>
  );
}

export default ItemsTable;
