import { t } from "ttag";

import { Box, Button } from "metabase/ui";

/**
 * Where a top-level item's name starts: past the expand toggle and the icon, plus the indent the name container
 * adds. Every level's button sits in this one column rather than following its own nesting.
 */
const FIRST_LEVEL_NAME_OFFSET = "42px";

/** The end of a level the server cut short. Reads the next page when asked. */
export function TreeLoadMore({
  isLoading,
  onLoadMore,
}: {
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <Box
      component="li"
      role="presentation"
      pl={FIRST_LEVEL_NAME_OFFSET}
      data-testid="tree-load-more"
    >
      <Button
        variant="subtle"
        size="compact-sm"
        pl={0}
        loading={isLoading}
        onClick={onLoadMore}
      >{t`Show more`}</Button>
    </Box>
  );
}
