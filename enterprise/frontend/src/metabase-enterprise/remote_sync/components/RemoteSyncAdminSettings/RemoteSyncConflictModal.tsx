import { useDispatch, useSelector } from "metabase/redux";

import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { getSyncConflictVariant } from "../../selectors";
import { syncConflictVariantUpdated } from "../../sync-task-slice";
import { SyncConflictModal } from "../SyncConflictModal";

export const RemoteSyncConflictModal = () => {
  const dispatch = useDispatch();
  const conflictVariant = useSelector(getSyncConflictVariant);
  const { currentBranch } = useGitSyncVisible();

  if (!conflictVariant || !currentBranch) {
    return null;
  }

  return (
    <SyncConflictModal
      currentBranch={currentBranch}
      onClose={() => {
        dispatch(syncConflictVariantUpdated(null));
      }}
      variant={conflictVariant}
    />
  );
};
