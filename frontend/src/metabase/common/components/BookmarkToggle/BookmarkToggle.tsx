import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";

import { BookmarkButton, BookmarkIcon } from "./BookmarkToggle.styled";

export interface BookmarkToggleProps extends HTMLAttributes<HTMLButtonElement> {
  isBookmarked: boolean;
  tooltipPlacement?: "top" | "bottom";
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
}

const BookmarkToggle = forwardRef(function BookmarkToggle(
  {
    isBookmarked,
    onCreateBookmark,
    onDeleteBookmark,
    tooltipPlacement,
    ...props
  }: BookmarkToggleProps,
  ref: Ref<HTMLButtonElement>,
) {
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

  const iconName = isBookmarked ? "bookmark_filled" : "bookmark";
  const label = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  return (
    <Tooltip label={label} position={tooltipPlacement}>
      <BookmarkButton
        {...props}
        aria-label={label}
        ref={ref}
        onClick={handleClick}
      >
        <BookmarkIcon
          name={iconName}
          isBookmarked={isBookmarked}
          isAnimating={isAnimating}
          onAnimationEnd={handleAnimationEnd}
        />
      </BookmarkButton>
    </Tooltip>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BookmarkToggle;
