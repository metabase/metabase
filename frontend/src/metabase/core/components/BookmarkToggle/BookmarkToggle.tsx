import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import Tooltip from "metabase/components/Tooltip";
import { BookmarkIcon, BookmarkButton } from "./BookmarkToggle.styled";

export interface BookmarkToggleProps {
  isBookmarked: boolean;
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
}

const BookmarkToggle = forwardRef(function BookmarkToggle(
  { isBookmarked, onCreateBookmark, onDeleteBookmark }: BookmarkToggleProps,
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

  return (
    <Tooltip tooltip={isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}>
      <BookmarkButton
        ref={ref}
        hoverColor={isBookmarked ? color("brand") : color("text-dark")}
        onClick={handleClick}
      >
        <BookmarkIcon
          name="bookmark"
          size={20}
          isBookmarked={isBookmarked}
          isAnimating={isAnimating}
          onAnimationEnd={handleAnimationEnd}
        />
      </BookmarkButton>
    </Tooltip>
  );
});

export default BookmarkToggle;
