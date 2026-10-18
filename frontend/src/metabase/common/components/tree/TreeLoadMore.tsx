import { t } from "ttag";

import { Box, Button } from "metabase/ui";

/**
 * Where an item's name starts, measured from the left of its row: past the expand toggle and the icon, plus the
 * indent the name container adds. Puts the label in the same column as the names above it.
 */
const NAME_OFFSET = "42px";

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
      style={{ paddingLeft: `calc(${depth}rem + ${NAME_OFFSET})` }}
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
