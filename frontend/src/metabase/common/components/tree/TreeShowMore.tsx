import { useIntersection } from "@mantine/hooks";
import { useEffect } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";

import S from "./TreeShowMore.module.css";

/**
 * Closes a level that the server cut short.
 *
 * Loads the next page when it scrolls into view, so the level grows as the user reaches the end of it. The button
 * stays because scrolling into view is not the only way to get here: keyboard users tab to it, and a level short
 * enough to be visible without scrolling would otherwise have no affordance at all.
 */
export function TreeShowMore({
  depth,
  isLoading,
  onClick,
}: {
  depth: number;
  isLoading: boolean;
  onClick: () => void;
}) {
  const { ref, entry } = useIntersection<HTMLLIElement>({ threshold: 0 });
  const isInView = entry?.isIntersecting ?? false;

  useEffect(() => {
    if (isInView && !isLoading) {
      onClick();
    }
  }, [isInView, isLoading, onClick]);

  return (
    <Box
      component="li"
      ref={ref}
      className={S.row}
      style={{ paddingLeft: `${depth}rem` }}
      data-testid="tree-show-more"
    >
      <Box
        component="button"
        type="button"
        className={S.button}
        disabled={isLoading}
        onClick={onClick}
      >
        {isLoading ? t`Loading…` : t`Show more`}
      </Box>
    </Box>
  );
}
