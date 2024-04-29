import { useKBar, VisualState } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
import { Button, Icon, Tooltip } from "metabase/ui";

const METAKEY = isMac() ? "⌘" : "Ctrl";

export const SearchButton = () => {
  const { query } = useKBar();

  const handleClick = useCallback(() => {
    query.setVisualState(VisualState.showing);
  }, [query]);

  return (
    <Tooltip label={`${t`Search...`} (${METAKEY}+k)`}>
      <Button leftIcon={<Icon name="search" />} onClick={handleClick}>
        Search
      </Button>
    </Tooltip>
  );
};
