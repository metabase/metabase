import { useAdminSetting } from "metabase/api/utils";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

export interface GitSyncVisibleState {
  isVisible: boolean;
  currentBranch: string | null | undefined;
}

/**
 * Hook to check if the GitSyncControls would be visible and get the current branch.
 * This centralizes the visibility logic used by GitSyncControls and other components.
 */
export const useGitSyncVisible = (): GitSyncVisibleState => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: currentBranch } = useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  const isVisible = !!(
    isRemoteSyncEnabled &&
    isAdmin &&
    currentBranch &&
    syncType === "read-write"
  );

  return { isVisible, currentBranch };
};
