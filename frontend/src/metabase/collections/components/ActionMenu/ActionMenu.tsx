import React, { useCallback } from "react";

import { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import {
  isFullyParametrized,
  isItemPinned,
  isItemQuestion,
  isPreviewEnabled,
  isPreviewShown,
} from "metabase/collections/utils";
import EventSandbox from "metabase/components/EventSandbox";

import { EntityItemMenu } from "./ActionMenu.styled";

export interface ActionMenuProps {
  className?: string;
  item: CollectionItem;
  collection: Collection;
  bookmarks?: Bookmark[];
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
  createBookmark?: (id: string, collection: string) => void;
  deleteBookmark?: (id: string, collection: string) => void;
}

function getIsBookmarked(item: CollectionItem, bookmarks: Bookmark[]) {
  const normalizedItemModel = normalizeItemModel(item);

  return bookmarks.some(
    bookmark =>
      bookmark.type === normalizedItemModel && bookmark.item_id === item.id,
  );
}

// If item.model is `dataset`, that is, this is a Model in a product sense,
// let’s call it "card" because `card` and `dataset` are treated the same in the back-end.
function normalizeItemModel(item: CollectionItem) {
  return item.model === "dataset" ? "card" : item.model;
}

function ActionMenu({
  className,
  item,
  bookmarks,
  collection,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
}: ActionMenuProps) {
  const isBookmarked = bookmarks && getIsBookmarked(item, bookmarks);
  const isPreviewOptionShown =
    isItemPinned(item) && isItemQuestion(item) && collection.can_write;

  const handlePin = useCallback(() => {
    item.setPinned?.(!isItemPinned(item));
  }, [item]);

  const handleCopy = useCallback(() => {
    onCopy([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    item.setArchived?.(true);
  }, [item]);

  const handleToggleBookmark = useCallback(() => {
    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;
    toggleBookmark?.(item.id.toString(), normalizeItemModel(item));
  }, [createBookmark, deleteBookmark, isBookmarked, item]);

  const handleTogglePreview = useCallback(() => {
    item?.setCollectionPreview?.(!isPreviewEnabled(item));
  }, [item]);

  return (
    // this component is used within a `<Link>` component,
    // so we must prevent events from triggering the activation of the link
    <EventSandbox preventDefault>
      <EntityItemMenu
        className={className}
        item={item}
        isBookmarked={isBookmarked}
        isPreviewShown={isPreviewShown(item)}
        isPreviewAvailable={isFullyParametrized(item)}
        onPin={collection.can_write ? handlePin : null}
        onMove={collection.can_write && item.setCollection ? handleMove : null}
        onCopy={item.copy ? handleCopy : null}
        onArchive={collection.can_write ? handleArchive : null}
        onToggleBookmark={handleToggleBookmark}
        onTogglePreview={isPreviewOptionShown ? handleTogglePreview : null}
        analyticsContext={ANALYTICS_CONTEXT}
      />
    </EventSandbox>
  );
}

export default ActionMenu;
