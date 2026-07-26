import { skipToken } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { useSelector } from "metabase/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { useGetWorktreeQuery } from "metabase-enterprise/api";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

export interface GitSyncVisibleState {
  isVisible: boolean;
  currentBranch: string | null | undefined;
  isBranchSetByEnv: boolean;
  isWorktree: boolean;
}

/**
 * Hook to check if the GitSyncControls would be visible and get the current branch.
 * This centralizes the visibility logic used by GitSyncControls and other components.
 *
 * When the current user has a `worktree_id`, `currentBranch` reflects that worktree's branch (not the
 * instance's git branch) so every consumer — the branch indicator and the push/pull/preflight calls
 * that key off `currentBranch` — operates on the worktree. Visibility is suppressed while the worktree
 * is being fetched, so nothing renders and no call fires against the wrong (git) branch in the meantime.
 */
export const useGitSyncVisible = (): GitSyncVisibleState => {
  const user = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: gitBranch, settingDetails: branchDetails } =
    useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  const worktreeId = user?.worktree_id;
  const isWorktree = typeof worktreeId === "number";
  const { data: worktree, isLoading: isWorktreeLoading } = useGetWorktreeQuery(
    isWorktree ? worktreeId : skipToken,
  );

  const currentBranch = isWorktree ? worktree?.branch : gitBranch;

  const isVisible = !!(
    user &&
    isRemoteSyncEnabled &&
    isAdmin &&
    currentBranch &&
    syncType === "read-write" &&
    !isWorktreeLoading
  );

  return {
    isVisible,
    currentBranch,
    isBranchSetByEnv: !!branchDetails?.is_env_setting,
    isWorktree,
  };
};
