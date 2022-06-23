import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { BookmarkIcon } from "./BookmarkToggle.styled";

export interface BookmarkToggleProps {
  isBookmarked: boolean;
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
}

const BookmarkToggle = ({
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: BookmarkToggleProps): JSX.Element | null => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark();
    } else {
      onCreateBookmark();
    }

    setIsAnimating(true);
  }, [isBookmarked, onCreateBookmark, onDeleteBookmark]);

  const handleAnimationEnd = useCallback(() => {
    setIsAnimating(false);
  }, []);

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

export default BookmarkToggle;
