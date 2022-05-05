import React, { useCallback } from "react";

import { Collection } from "metabase-types/api";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { Item, isItemPinned } from "metabase/collections/utils";
import EventSandbox from "metabase/components/EventSandbox";

import { EntityItemMenu } from "./ActionMenu.styled";
import { BookmarksType } from "metabase-types/api/bookmark";

type Props = {
  bookmarks?: BookmarksType;
  createBookmark?: (id: string, collection: string) => void;
  deleteBookmark?: (id: string, collection: string) => void;
  className?: string;
  item: Item;
  collection: Collection;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

function getIsBookmarked(item: Item, bookmarks: BookmarksType) {
  const normalizedItemModel = normalizeItemModel(item);

  return bookmarks.some(
    bookmark =>
      bookmark.type === normalizedItemModel && bookmark.item_id === item.id,
  );
}

// If item.model is `dataset`, that is, this is a Model in a product sense,
// let’s call it "card" because `card` and `dataset` are treated the same in the back-end.
function normalizeItemModel(item: Item) {
  return item.model === "dataset" ? "card" : item.model;
}

function ActionMenu({
  bookmarks,
  createBookmark,
  deleteBookmark,
  className,
  item,
  collection,
  onCopy,
  onMove,
}: Props) {
  const isBookmarked = bookmarks && getIsBookmarked(item, bookmarks);

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

  const handleToggleBookmark = useCallback(() => {
    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

    const normalizedItemModel = normalizeItemModel(item);

    toggleBookmark?.(item.id.toString(), normalizedItemModel);
  }, [createBookmark, deleteBookmark, isBookmarked, item]);

  return (
    // this component is used within a `<Link>` component,
    // so we must prevent events from triggering the activation of the link
    <EventSandbox preventDefault>
      <EntityItemMenu
        className={className}
        item={item}
        isBookmarked={isBookmarked}
        onPin={collection.can_write ? handlePin : null}
        onMove={collection.can_write && item.setCollection ? handleMove : null}
        onCopy={item.copy ? handleCopy : null}
        onArchive={
          collection.can_write && item.setArchived ? handleArchive : null
        }
        onToggleBookmark={handleToggleBookmark}
        analyticsContext={ANALYTICS_CONTEXT}
      />
    </EventSandbox>
  );
}

export default ActionMenu;
