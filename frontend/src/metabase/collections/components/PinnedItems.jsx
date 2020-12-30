import React from "react";
import { Box } from "grid-styled";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import cx from "classnames";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import NormalItem from "metabase/collections/components/NormalItem";
import CollectionSectionHeading from "metabase/collections/components/CollectionSectionHeading";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

const PinnedItem = ({ item, index, collection, onCopy, onMove }) => (
  <Link
    key={index}
    to={item.getUrl()}
    className="hover-parent hover--visibility"
    hover={{ color: color("brand") }}
    data-metabase-event={`${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`}
  >
    <NormalItem
      item={item}
      collection={collection}
      onPin={() => item.setPinned(false)}
      onMove={onMove}
      onCopy={onCopy}
      pinned
    />
  </Link>
);

export default function PinnedItems({ items, collection, onMove, onCopy }) {
  if (items.length === 0) {
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
  return (
    <Box pt={2} pb={3}>
      <CollectionSectionHeading>{t`Pinned items`}</CollectionSectionHeading>
      <PinDropTarget
        pinIndex={items[items.length - 1].collection_position + 1}
        noDrop
        marginLeft={8}
        marginRight={8}
      >
        {items.map((item, index) => (
          <Box w={[1]} className="relative" key={index}>
            <ItemDragSource item={item} collection={collection}>
              <PinnedItem
                key={`${item.model}:${item.id}`}
                index={index}
                item={item}
                collection={collection}
                onMove={onMove}
                onCopy={onCopy}
              />
              <PinPositionDropTarget pinIndex={item.collection_position} left />
              <PinPositionDropTarget
                pinIndex={item.collection_position + 1}
                right
              />
            </ItemDragSource>
          </Box>
        ))}
        {items.length % 2 === 1 ? (
          <Box w={1} className="relative">
            <PinPositionDropTarget
              pinIndex={items[items.length - 1].collection_position + 1}
            />
          </Box>
        ) : null}
      </PinDropTarget>
    </Box>
  );
}
