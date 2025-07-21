import cx from "classnames";
import {
  type HTMLAttributes,
  type Ref,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import { ToolbarButton } from "../ToolbarButton";

import Styles from "./BookmarkToggle.module.css";

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
  }: BookmarkToggleProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [animate, setAnimate] = useState(false);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark();
    } else {
      onCreateBookmark();
    }
    setAnimate(true);
  }, [isBookmarked, onCreateBookmark, onDeleteBookmark]);

  const iconName = isBookmarked ? "bookmark_filled" : "bookmark";
  const label = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  return (
    <ToolbarButton
      aria-label={label}
      ref={ref}
      onClick={handleClick}
      tooltipLabel={label}
      tooltipPosition={tooltipPlacement}
    >
      <Icon
        name={iconName}
        c={isBookmarked ? "brand" : "inherit"}
        className={cx(Styles.Icon, {
          [Styles.Bookmarked]: isBookmarked,
          [Styles.Not_Bookmarked]: !isBookmarked,
          [Styles.Animate]: animate,
        })}
      />
    </ToolbarButton>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BookmarkToggle;
