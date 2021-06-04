import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import { color } from "metabase/lib/colors";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

import Icon from "metabase/components/Icon";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import BaseItemsTable, { BaseTableItem } from "./BaseItemsTable";

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

PinnedItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function PinnedItemsTable({ items, ...props }) {
  const renderItem = useCallback(itemProps => {
    const { item } = itemProps;
    return (
      <BaseTableItem
        key={`${item.model}-${item.id}`}
        {...itemProps}
        linkProps={{
          className: "hover-parent hover--visibility",
          hover: { color: color("brand") },
          "data-metabase-event": `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`,
        }}
      />
    );
  }, []);

  if (items.length === 0) {
    return <PinnedItemsEmptyState />;
  }

  const lastItem = items[items.length - 1];
  return (
    <PinDropTarget pinIndex={lastItem.collection_position + 1}>
      <BaseItemsTable
        {...props}
        items={items}
        pinned
        renderItem={renderItem}
        data-testid="pinned-items"
      />
    </PinDropTarget>
  );
}

export default PinnedItemsTable;
