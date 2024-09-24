import type { HTMLAttributes } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { type ButtonProps, Flex, Tooltip } from "metabase/ui";

import { BookmarkButton, BookmarkIcon } from "./BookmarkToggle.styled";

export interface BookmarkToggleProps
  extends ButtonProps,
    HTMLAttributes<HTMLButtonElement> {
  isBookmarked: boolean;
  tooltipPlacement?: "top" | "bottom";
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
  shouldShowIconOnly?: boolean;
}

const BookmarkToggle = ({
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
  tooltipPlacement,
  shouldShowIconOnly = true,
  ...props
}: BookmarkToggleProps) => {
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
  const title = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  return (
    <Tooltip
      disabled={!shouldShowIconOnly}
      label={title}
      position={tooltipPlacement}
    >
      <BookmarkButton
        variant="subtle"
        {...props}
        isBookmarked={isBookmarked}
        onClick={handleClick}
        shouldShowIconOnly={shouldShowIconOnly}
      >
        <Flex gap=".65em" justify="flex-start">
          <BookmarkIcon
            name={iconName}
            isBookmarked={isBookmarked}
            isAnimating={isAnimating}
            onAnimationEnd={handleAnimationEnd}
          />
          {!shouldShowIconOnly && title}
        </Flex>
      </BookmarkButton>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BookmarkToggle;
