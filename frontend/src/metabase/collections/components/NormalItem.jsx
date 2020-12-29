import React from "react";

import { entityTypeForObject } from "metabase/schema";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

export default function NormalItem({
  item,
  collection = {},
  selection = new Set(),
  onToggleSelected,
  onMove,
  onCopy,
  onPin,
  pinned,
}) {
  return (
    <Link
      to={item.getUrl()}
      data-metabase-event={`${ANALYTICS_CONTEXT};Item Click;${item.model}`}
    >
      <EntityItem
        analyticsContext={ANALYTICS_CONTEXT}
        variant="list"
        showSelect={selection.size > 0}
        selectable
        item={item}
        type={entityTypeForObject(item)}
        name={item.getName()}
        iconName={item.getIcon()}
        iconColor={item.getColor()}
        isFavorite={item.favorite}
        onFavorite={
          item.setFavorited ? () => item.setFavorited(!item.favorite) : null
        }
        onPin={collection.can_write && onPin && onPin}
        onMove={
          collection.can_write && item.setCollection
            ? () => onMove([item])
            : null
        }
        onCopy={item.copy ? () => onCopy([item]) : null}
        onArchive={
          collection.can_write && item.setArchived
            ? () => item.setArchived(true)
            : null
        }
        selected={selection.has(item)}
        onToggleSelected={() => {
          onToggleSelected(item);
        }}
        pinned={pinned}
      />
    </Link>
  );
}
