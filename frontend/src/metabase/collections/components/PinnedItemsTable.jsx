import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

import Icon from "metabase/components/Icon";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import BaseItemsTable from "./BaseItemsTable";

function PinnedItemsEmptyState() {
  return (
    <PinDropTarget pinIndex={1} hideUntilDrag>
      {({ hovered }) => (
        <div
          className={cx(
            "p2 flex layout-centered",
            hovered ? "text-brand" : "text-light",
          )}
        >
          <Icon name="pin" mr={1} />
          {t`Drag something here to pin it to the top`}
        </div>
      )}
    </PinDropTarget>
  );
}

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

PinnedItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function PinnedItemsTable(props) {
  const { items } = props;

  if (items.length === 0) {
    return <PinnedItemsEmptyState />;
  }

  const lastItem = items[items.length - 1];
  return (
    <PinDropTarget pinIndex={lastItem.collection_position + 1}>
      <BaseItemsTable
        {...props}
        isPinned
        renderItem={PinnedItem}
        data-testid="pinned-items"
      />
    </PinDropTarget>
  );
}

export default PinnedItemsTable;
