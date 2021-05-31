/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import cx from "classnames";
import { Box } from "grid-styled";

import { color } from "metabase/lib/colors";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";

import Icon from "metabase/components/Icon";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import BaseItemsTable, {
  BaseTableItem,
  TABLE_HEAD_HEIGHT,
  ROW_HEIGHT,
} from "./BaseItemsTable";

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

function PinnedItemsTable({ items, ...props }) {
  const renderItem = useCallback(itemProps => {
    const { item, index } = itemProps;
    const dropTargetStyle = {
      height: ROW_HEIGHT,
      top: TABLE_HEAD_HEIGHT + index * ROW_HEIGHT,
    };
    return (
      <BaseTableItem
        {...itemProps}
        linkProps={{
          className: "hover-parent hover--visibility",
          hover: { color: color("brand") },
          "data-metabase-event": `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`,
        }}
      >
        <React.Fragment>
          <PinPositionDropTarget
            left
            pinIndex={item.collection_position}
            style={dropTargetStyle}
          />
          <PinPositionDropTarget
            right
            pinIndex={item.collection_position + 1}
            style={dropTargetStyle}
          />
        </React.Fragment>
      </BaseTableItem>
    );
  }, []);

  if (items.length === 0) {
    return <PinnedItemsEmptyState />;
  }

  const lastItem = items[items.length - 1];
  const bottomPinIndex = lastItem.collection_position + 1;

  return (
    <PinDropTarget
      pinIndex={bottomPinIndex}
      noDrop
      marginLeft={8}
      marginRight={8}
    >
      <BaseItemsTable {...props} items={items} pinned renderItem={renderItem} data-testid="pinned-items" />
      {items.length % 2 === 1 ? (
        <Box w={1} className="relative">
          <PinPositionDropTarget pinIndex={bottomPinIndex} />
        </Box>
      ) : null}
    </PinDropTarget>
  );
}

export default PinnedItemsTable;
