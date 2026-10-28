import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

export const SearchButton = (props: ActionIconProps) => {
  const kbar = useKBar();
  const { setVisualState } = kbar.query;

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  return (
    <Tooltip label={t`Search (${METAKEY}+K)`}>
      <ActionIcon onClick={handleClick} aria-label={t`Search`} {...props}>
        <Icon name="search" />
      </ActionIcon>
    </Tooltip>
  );
};
