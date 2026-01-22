import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { SyncConflictModal } from "metabase-enterprise/remote_sync/components/SyncConflictModal";
import { useGitSyncVisible } from "metabase-enterprise/remote_sync/hooks/use-git-sync-visible";
import { getSyncConflictVariant } from "metabase-enterprise/remote_sync/selectors";
import { setSyncConflictVariant } from "metabase-enterprise/remote_sync/sync-task-slice";

import { RemoteSyncSettingsForm } from "./RemoteSyncSettingsForm";

export const RemoteSyncAdminSettings = () => {
  const dispatch = useDispatch();
  const conflictVariant = useSelector(getSyncConflictVariant);
  const { currentBranch } = useGitSyncVisible();

  return (
    <>
      <SettingsPageWrapper
        title={t`Remote Sync`}
        description={t`Keep your dashboards, questions, and collections safely backed up in Git.`}
      >
        <RemoteSyncSettingsForm />
      </SettingsPageWrapper>
      {!!conflictVariant && !!currentBranch && (
        <SyncConflictModal
          currentBranch={currentBranch}
          onClose={() => {
            dispatch(setSyncConflictVariant(null));
          }}
          variant={conflictVariant}
        />
      )}
    </>
  );
};
