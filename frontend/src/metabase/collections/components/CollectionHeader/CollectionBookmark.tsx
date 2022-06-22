import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import { Collection } from "metabase-types/api";
import {
  BookmarkIcon,
  BookmarkIconContainer,
} from "./CollectionBookmark.styled";

export interface CollectionBookmarkProps {
  collection: Collection;
  isRoot: boolean;
  isBookmarked: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionBookmark = ({
  collection,
  isRoot,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionBookmarkProps): JSX.Element | null => {
  const [isChanged, setIsChanged] = useState(false);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark(collection);
    } else {
      onCreateBookmark(collection);
    }

    setIsChanged(true);
  }, [collection, isBookmarked, onCreateBookmark, onDeleteBookmark]);

  if (isRoot) {
    return null;
  }

  return (
    <Tooltip tooltip={isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}>
      <BookmarkIconContainer isBookmarked={isBookmarked} onClick={handleClick}>
        <BookmarkIcon
          name="bookmark"
          size={20}
          isBookmarked={isBookmarked}
          isChanged={isChanged}
        />
      </BookmarkIconContainer>
    </Tooltip>
  );
};

export default CollectionBookmark;
