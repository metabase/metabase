import { t } from "ttag";

import { Box, Button } from "metabase/ui";

import S from "./TreeLoadMore.module.css";

/** The end of a level the server cut short. Reads the next page when asked. */
export function TreeLoadMore({
  depth,
  isLoading,
  onLoadMore,
}: {
  depth: number;
  isLoading: boolean;
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
    </Box>
  );
}
