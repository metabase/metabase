import { skipToken } from "@reduxjs/toolkit/query";

import { getUser, getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useAdminSetting } from "metabase/settings";
import { useGetWorktreeQuery } from "metabase-enterprise/api";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

export interface GitSyncVisibleState {
  isVisible: boolean;
  isReadWrite: boolean;
  currentBranch: string | null | undefined;
  isInWorktree: boolean;
  isBranchSetByEnv: boolean;
}

/**
 * Hook to check if the GitSyncControls would be visible and get the current branch.
 * This centralizes the visibility logic used by GitSyncControls and other components.
 */
export const useGitSyncVisible = (): GitSyncVisibleState => {
  const isAdmin = useSelector(getUserIsAdmin);
  const worktreeId = useSelector(getUser)?.worktree_id ?? null;
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: instanceBranch, settingDetails: branchDetails } =
    useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);
  const { data: worktree } = useGetWorktreeQuery(worktreeId ?? skipToken);
  const currentBranch = worktreeId != null ? worktree?.branch : instanceBranch;

  return {
    isVisible:
      (isRemoteSyncEnabled ?? false) && isAdmin && currentBranch != null,
    isReadWrite: syncType === "read-write",
    currentBranch,
    isInWorktree: worktreeId != null,
    isBranchSetByEnv: !!branchDetails?.is_env_setting,
  };
};
