import { t } from "ttag";

import { Box } from "metabase/ui";

import S from "./TreeShowMore.module.css";

/**
 * Closes a level that the server cut short, so the rest of it can be loaded.
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
  return (
    <Box
      component="li"
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
