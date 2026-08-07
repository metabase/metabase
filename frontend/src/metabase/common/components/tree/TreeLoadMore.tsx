import { c, t } from "ttag";

import { Box, Button } from "metabase/ui";

import S from "./TreeLoadMore.module.css";

/**
 * The end of a level the server cut short: reads the next page when asked, and says how much of the level is on
 * screen.
 */
export function TreeLoadMore({
  depth,
  isLoading,
  remaining = 0,
  total = 0,
  onLoadMore,
}: {
  depth: number;
  isLoading: boolean;
  /** How many rows the level holds beyond the ones already rendered. */
  remaining?: number;
  /** How many rows the level holds in all. */
  total?: number;
  onLoadMore: () => void;
}) {
  return (
    <Box
      component="li"
      role="presentation"
      className={S.root}
      style={{ paddingLeft: `${depth}rem` }}
      data-testid="tree-load-more"
    >
      <Button
        variant="subtle"
        size="compact-sm"
        loading={isLoading}
        onClick={onLoadMore}
      >{t`Show more`}</Button>
      {remaining > 0 && (
        <Box className={S.count} data-testid="tree-level-count">
          {c("{0} is how many rows are shown, {1} how many there are in all")
            .t`${total - remaining} of ${total}`}
        </Box>
      )}
    </Box>
  );
}
