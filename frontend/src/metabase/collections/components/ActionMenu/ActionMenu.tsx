import React, { useCallback } from "react";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { Item, Collection, isItemPinned } from "metabase/collections/utils";

import { EntityItemMenu } from "./ActionMenu.styled";

type Props = {
  className?: string;
  item: Item;
  collection: Collection;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

function ActionMenu({ className, item, collection, onCopy, onMove }: Props) {
  const handlePin = useCallback(() => {
    item.setPinned(!isItemPinned(item));
  }, [item]);

  const handleCopy = useCallback(() => {
    onCopy([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    item.setArchived(true);
  }, [item]);

  return (
    <div
      className={className}
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <EntityItemMenu
        item={item}
        onPin={collection.can_write ? handlePin : null}
        onMove={collection.can_write && item.setCollection ? handleMove : null}
        onCopy={item.copy ? handleCopy : null}
        onArchive={
          collection.can_write && item.setArchived ? handleArchive : null
        }
        analyticsContext={ANALYTICS_CONTEXT}
        className={undefined}
      />
    </div>
  );
}

export default ActionMenu;
