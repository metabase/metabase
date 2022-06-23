import React, { useCallback } from "react";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import { isRootCollection } from "metabase/collections/utils";
import { Collection } from "metabase-types/api";

export interface CollectionBookmarkProps {
  collection: Collection;
  isBookmarked: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionBookmark = ({
  collection,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionBookmarkProps): JSX.Element | null => {
  const isRoot = isRootCollection(collection);

  const handleCreateBookmark = useCallback(() => {
    onCreateBookmark(collection);
  }, [collection, onCreateBookmark]);

  const handleDeleteBookmark = useCallback(() => {
    onDeleteBookmark(collection);
  }, [collection, onDeleteBookmark]);

  if (isRoot) {
    return null;
  }

  return (
    <BookmarkToggle
      isBookmarked={isBookmarked}
      onCreateBookmark={handleCreateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
    />
  );
};

export default CollectionBookmark;
