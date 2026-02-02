import cx from "classnames";
import type { Ref } from "react";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";

import S from "./BookmarkToggle.module.css";

export interface BookmarkToggleProps extends ActionIconProps {
  isBookmarked: boolean;
  tooltipPlacement?: "top" | "bottom";
  onCreateBookmark: () => void;
  onDeleteBookmark: () => void;
}

export const BookmarkToggle = forwardRef(function BookmarkToggle(
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
      <ActionIcon
        {...props}
        aria-label={label}
        ref={ref}
        onClick={handleClick}
        variant="viewHeader"
        size="2rem"
      >
        <Icon
          name={iconName}
          className={cx(S.icon, {
            [S.iconAnimating]: isAnimating,
            [S.actionIconBookmarked]: isBookmarked,
            [S.iconAnimatingBookmarked]: isAnimating && isBookmarked,
            [S.iconAnimatingUnbookmarked]: isAnimating && !isBookmarked,
          })}
          onAnimationEnd={handleAnimationEnd}
        />
      </ActionIcon>
    </Tooltip>
  );
});
