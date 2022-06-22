import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { isRootCollection } from "metabase/collections/utils";
import { Collection } from "metabase-types/api";
import { BookmarkIcon } from "./CollectionBookmark.styled";

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
  const [isAnimating, setIsAnimating] = useState(false);
  const isRoot = isRootCollection(collection);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark(collection);
    } else {
      onCreateBookmark(collection);
    }

    setIsAnimating(true);
  }, [collection, isBookmarked, onCreateBookmark, onDeleteBookmark]);

  const handleAnimationEnd = useCallback(() => {
    setIsAnimating(false);
  }, []);

  if (isRoot) {
    return null;
  }

  return (
    <Tooltip tooltip={isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}>
      <IconWrapper
        hover={{ color: isBookmarked ? color("brand") : color("text-dark") }}
        onClick={handleClick}
      >
        <BookmarkIcon
          name="bookmark"
          size={20}
          isBookmarked={isBookmarked}
          isAnimating={isAnimating}
          onAnimationEnd={handleAnimationEnd}
        />
      </IconWrapper>
    </Tooltip>
  );
};

export default CollectionBookmark;
