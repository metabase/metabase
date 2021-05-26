/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import cx from "classnames";

import { color } from "metabase/lib/colors";

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

function PinnedItemsTable({ items, ...props }) {
  const getLinkProps = useCallback(
    item => ({
      className: "hover-parent hover--visibility",
      hover: { color: color("brand") },
      "data-metabase-event": `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`,
    }),
    [],
  );

  if (items.length === 0) {
    return <PinnedItemsEmptyState />;
  }

  return (
    <BaseItemsTable
      {...props}
      items={items}
      pinned
      getLinkProps={getLinkProps}
    />
  );
}

export default PinnedItemsTable;
