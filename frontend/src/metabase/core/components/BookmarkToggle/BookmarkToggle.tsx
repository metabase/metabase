import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { BookmarkIcon } from "./BookmarkToggle.styled";

export interface BookmarkToggleProps extends HTMLAttributes<HTMLDivElement> {
  isBookmarked: boolean;
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
}

const BookmarkToggle = forwardRef(function BookmarkToggle(
  {
    isBookmarked,
    onCreateBookmark,
    onDeleteBookmark,
    ...props
  }: BookmarkToggleProps,
  ref: Ref<HTMLDivElement>,
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
      <IconWrapper
        {...props}
        ref={ref}
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
});

export default BookmarkToggle;
