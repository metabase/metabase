import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Flex } from "grid-styled";

import { color } from "metabase/lib/colors";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

function ItemsEmptyState() {
  return (
    <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
      {({ hovered }) => (
        <Flex
          align="center"
          justify="center"
          py={2}
          m={2}
          color={hovered ? color("brand") : color("text-medium")}
        >
          {t`Drag here to un-pin`}
        </Flex>
      )}
    </PinDropTarget>
  );
}

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
    return <ItemsEmptyState />;
  }

  return (
    <PinDropTarget pinIndex={null}>
      <BaseItemsTable {...props} renderItem={Item} />
    </PinDropTarget>
  );
}

export default ItemsTable;
