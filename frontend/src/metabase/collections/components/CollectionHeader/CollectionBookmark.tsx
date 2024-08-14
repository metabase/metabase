import { useCallback } from "react";

import { isRootCollection } from "metabase/collections/utils";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import type { Collection } from "metabase-types/api";

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
      tooltipPlacement="bottom"
      onCreateBookmark={handleCreateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBookmark;
