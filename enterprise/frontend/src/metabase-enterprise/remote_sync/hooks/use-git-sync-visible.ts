import { useAdminSetting } from "metabase/api/utils";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

export interface GitSyncVisibleState {
  isVisible: boolean;
  currentBranch: string | null | undefined;
  isBranchSetByEnv: boolean;
}

/**
 * Whether git sync controls should be offered — an admin on a read-write instance with sync
 * enabled and a branch set — along with the branch itself.
 */
export const useGitSyncVisible = (): GitSyncVisibleState => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: currentBranch, settingDetails: branchDetails } =
    useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  const isVisible = !!(
    isRemoteSyncEnabled &&
    isAdmin &&
    currentBranch &&
    syncType === "read-write"
  );

  return {
    isVisible,
    currentBranch,
    isBranchSetByEnv: !!branchDetails?.is_env_setting,
  };
};
