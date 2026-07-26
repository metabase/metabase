import { skipToken } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { useSelector } from "metabase/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

export interface GitSyncVisibleState {
  isVisible: boolean;
  currentBranch: string | null | undefined;
  isBranchSetByEnv: boolean;
  isWorkspace: boolean;
}

/**
 * Hook to check if the GitSyncControls would be visible and get the current branch.
 * This centralizes the visibility logic used by GitSyncControls and other components.
 *
 * When the current user has a `workspace_id`, `currentBranch` reflects that workspace's branch (not the
 * instance's git branch) so every consumer — the branch indicator and the push/pull/preflight calls
 * that key off `currentBranch` — operates on the workspace. Visibility is suppressed while the workspace
 * is being fetched, so nothing renders and no call fires against the wrong (git) branch in the meantime.
 */
export const useGitSyncVisible = (): GitSyncVisibleState => {
  const user = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: gitBranch, settingDetails: branchDetails } =
    useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  const workspaceId = user?.workspace_id;
  const isWorkspace = typeof workspaceId === "number";
  const { data: workspace, isLoading: isWorkspaceLoading } =
    useGetWorkspaceQuery(isWorkspace ? workspaceId : skipToken);

  const currentBranch = isWorkspace ? workspace?.branch : gitBranch;

  const isVisible = !!(
    user &&
    isRemoteSyncEnabled &&
    isAdmin &&
    currentBranch &&
    syncType === "read-write" &&
    !isWorkspaceLoading
  );

  return {
    isVisible,
    currentBranch,
    isBranchSetByEnv: !!branchDetails?.is_env_setting,
    isWorkspace,
  };
};
