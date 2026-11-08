import { useMemo } from "react";
import { t } from "ttag";

import type {
  RemoteSyncChangesBadgeProps,
  RemoteSyncChangesTarget,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Tooltip } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import { getIsRemoteSyncVisible } from "../../selectors";

import { getRemoteSyncChanges, hasRemoteSyncChanges } from "./utils";

export const ChangesBadge = ({ target }: RemoteSyncChangesBadgeProps) => {
  const isVisible = useSelector(getIsRemoteSyncVisible);

  if (!isVisible) {
    return null;
  }

  return <ChangesBadgeContent target={target} />;
};

const ChangesBadgeContent = ({ target }: RemoteSyncChangesBadgeProps) => {
  const hasChanges = useHasRemoteSyncChanges(target);

  if (!hasChanges) {
    return null;
  }

  return (
    <Tooltip label={t`Changes not pushed yet`}>
      <Box
        data-testid="remote-sync-status"
        bg="feedback-warning"
        bdrs="50%"
        h="0.5rem"
        w="0.5rem"
        mr="xxs"
        flex="0 0 auto"
      />
    </Tooltip>
  );
};

const useHasRemoteSyncChanges = (target: RemoteSyncChangesTarget): boolean => {
  const { data } = useGetRemoteSyncChangesQuery();
  const changes = useMemo(
    () => getRemoteSyncChanges(data?.dirty ?? []),
    [data],
  );

  return hasRemoteSyncChanges(changes, target);
};
