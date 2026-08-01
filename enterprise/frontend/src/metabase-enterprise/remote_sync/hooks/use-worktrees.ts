import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useListWorktreesQuery } from "metabase-enterprise/api";

import { REMOTE_SYNC_KEY } from "../constants";

/**
 * The remote-sync worktrees, for UI that offers them. Worktree content is
 * admin-only, so the list is only fetched — and `isEnabled` only true — for
 * admins with remote sync turned on.
 */
export const useWorktrees = ({ skip = false }: { skip?: boolean } = {}) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const isEnabled = isAdmin && isRemoteSyncEnabled && !skip;

  const { data: worktrees = [], isFetching } = useListWorktreesQuery(
    undefined,
    {
      skip: !isEnabled,
    },
  );

  return { worktrees, isEnabled, isFetching };
};
