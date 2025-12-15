import { useAdminSetting } from "metabase/api/utils";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../constants";

/**
 * Hook to check if the GitSyncControls would be visible.
 * This mirrors the visibility logic in GitSyncControls component.
 */
export const useGitSyncVisible = (): boolean => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: currentBranch } = useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  return !!(
    isRemoteSyncEnabled &&
    isAdmin &&
    currentBranch &&
    syncType === "read-write"
  );
};
