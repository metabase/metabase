import { useCallback, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon, Loader, Tooltip } from "metabase/ui";
import {
  useGetRemoteSyncChangesQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";

import { trackBranchSwitched, trackPullChanges } from "../../analytics";
import { BRANCH_KEY, REMOTE_SYNC_KEY, TYPE_KEY } from "../../constants";
import { useSyncStatus } from "../../hooks/use-sync-status";
import { type SyncError, parseSyncError } from "../../utils";
import { PushChangesModal } from "../PushChangesModal";
import {
  SyncConflictModal,
  type SyncConflictVariant,
} from "../SyncConflictModal";

import { BranchPicker } from "./BranchPicker";

export const GitSyncControls = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);
  const { value: currentBranch } = useAdminSetting(BRANCH_KEY);
  const { value: syncType } = useAdminSetting(TYPE_KEY);

  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [syncConflictVariant, setSyncConflictVariant] =
    useState<SyncConflictVariant>();
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  const [nextBranch, setNextBranch] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [sendToast] = useToast();

  const { data: dirtyData, refetch: refetchDirty } =
    useGetRemoteSyncChangesQuery(undefined, {
      skip: !isRemoteSyncEnabled,
      refetchOnFocus: true,
    });

  const isSwitchingBranch = !!nextBranch;
  const isDirty = !!(dirtyData?.dirty && dirtyData.dirty.length > 0);
  const isLoading = isSyncTaskRunning || isSwitchingBranch || isImporting;

  const changeBranch = useCallback(
    async (branch: string | null, isNewBranch?: boolean) => {
      if (branch == null) {
        console.warn("Trying to switch to null branch");
        return;
      }

      if (!isNewBranch) {
        await importChanges({ branch });

        trackBranchSwitched({
          triggeredFrom: "app-bar",
        });
      }

      setNextBranch(null);
    },
    [importChanges],
  );

  const handleBranchSelect = useCallback(
    async (branch: string, isNewBranch?: boolean) => {
      try {
        if (branch === currentBranch) {
          return;
        }

        setNextBranch(branch);

        const freshDirtyData = await refetchDirty().unwrap();
        const hasDirtyChanges = freshDirtyData.dirty.length > 0;

        if (hasDirtyChanges && !isNewBranch) {
          setSyncConflictVariant("switch-branch");
        } else {
          await changeBranch(branch, isNewBranch);
          setNextBranch(null);
        }
      } catch {
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: t`Sorry, we were unable to switch branches.`,
        });
        setNextBranch(null);
      }
    },
    [currentBranch, changeBranch, refetchDirty, sendToast],
  );

  const handlePullClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    try {
      await importChanges({ branch: currentBranch }).unwrap();

      trackPullChanges({
        triggeredFrom: "app-bar",
        force: false,
      });

      sendToast({
        message: t`Your branch is now up to date with remote`,
        icon: "check",
      });
    } catch (error) {
      const { hasConflict, errorMessage } = parseSyncError(error as SyncError);

      if (hasConflict) {
        setSyncConflictVariant("pull");
        return;
      }

      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }
  }, [currentBranch, importChanges, sendToast]);

  const handlePushClick = useCallback(() => {
    setShowPushModal(true);
  }, []);

  const handleClosePushModal = useCallback(() => {
    setShowPushModal(false);
  }, []);

  const handleCloseSyncConflictModal = useCallback(() => {
    setSyncConflictVariant(undefined);
    setNextBranch(null);
  }, []);

  // Don't render if remote sync is not enabled, user is not admin, or not in read-write mode
  if (
    !isRemoteSyncEnabled ||
    !isAdmin ||
    !currentBranch ||
    syncType !== "read-write"
  ) {
    return null;
  }

  return (
    <>
      <Button.Group data-testid="git-sync-controls" mr="2rem">
        <BranchPicker
          isLoading={isLoading}
          value={currentBranch}
          onChange={handleBranchSelect}
          baseBranch={currentBranch}
        />

        <Tooltip label={t`Pull from Git`}>
          <Button
            variant="default"
            size="compact-sm"
            px="0.5rem"
            py="1rem"
            onClick={handlePullClick}
            disabled={isLoading}
            aria-label={t`Pull from Git`}
            data-testid="git-pull-button"
            leftSection={
              isImporting ? (
                <Loader size="xs" />
              ) : (
                <Icon name="arrow_down" size={16} />
              )
            }
          />
        </Tooltip>

        <Tooltip label={isDirty ? t`Push to Git` : t`No changes to push`}>
          <Button
            variant="default"
            size="compact-sm"
            px="0.5rem"
            py="1rem"
            onClick={handlePushClick}
            disabled={isLoading || !isDirty}
            aria-label={t`Push to Git`}
            data-testid="git-push-button"
            leftSection={<Icon name="arrow_up" size={16} />}
          />
        </Tooltip>
      </Button.Group>

      {showPushModal && (
        <PushChangesModal
          onClose={handleClosePushModal}
          currentBranch={currentBranch}
        />
      )}

      {syncConflictVariant && (
        <SyncConflictModal
          currentBranch={currentBranch}
          nextBranch={nextBranch}
          onClose={handleCloseSyncConflictModal}
          variant={syncConflictVariant}
        />
      )}
    </>
  );
};
