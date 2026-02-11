import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Combobox, Icon, Loader, Text, useCombobox } from "metabase/ui";
import {
  useGetHasRemoteChangesQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import { getSyncConflictVariant } from "metabase-enterprise/remote_sync/selectors";
import { syncConflictVariantUpdated } from "metabase-enterprise/remote_sync/sync-task-slice";

import { trackBranchSwitched, trackPullChanges } from "../../analytics";
import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";
import { useSyncStatus } from "../../hooks/use-sync-status";
import { type SyncError, parseSyncError } from "../../utils";
import { PushChangesModal } from "../PushChangesModal";
import { SyncConflictModal } from "../SyncConflictModal";

import { BranchDropdown } from "./BranchDropdown";
import S from "./GitSyncControls.module.css";
import { GitSyncOptionsDropdown } from "./GitSyncOptionsDropdown";

type DropdownView = "options" | "branch";

export const GitSyncControls = () => {
  const dispatch = useDispatch();
  const conflictVariant = useSelector(getSyncConflictVariant);
  const { isVisible, currentBranch } = useGitSyncVisible();

  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  const [nextBranch, setNextBranch] = useState<string | null>(null);
  const [showPushModal, { toggle: togglePushModal }] = useDisclosure(false);
  const [sendToast] = useToast();
  const [dropdownView, setDropdownView] = useState<DropdownView>("options");
  const combobox = useCombobox();

  const { isDirty, refetch: refetchDirty } = useRemoteSyncDirtyState();

  const { data: hasRemoteChangesData, isLoading: isFetchingRemoteChanges } =
    useGetHasRemoteChangesQuery(undefined, {
      refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
      skip: !combobox.dropdownOpened,
    });
  const { has_changes: hasRemoteChanges } = hasRemoteChangesData || {};

  const isSwitchingBranch = !!nextBranch;
  const isLoading =
    isSyncTaskRunning ||
    isSwitchingBranch ||
    isImporting ||
    isFetchingRemoteChanges;

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
          dispatch(syncConflictVariantUpdated("switch-branch"));
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
    [currentBranch, refetchDirty, dispatch, changeBranch, sendToast],
  );

  const handlePushClick = useCallback(() => {
    togglePushModal();
    combobox.closeDropdown();
  }, [combobox, togglePushModal]);

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
    } catch (error) {
      const { hasConflict, errorMessage } = parseSyncError(error as SyncError);

      if (hasConflict) {
        dispatch(syncConflictVariantUpdated("pull"));
        return;
      }

      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }

    combobox.closeDropdown();
  }, [combobox, currentBranch, dispatch, importChanges, sendToast]);

  const handleCloseSyncConflictModal = useCallback(() => {
    dispatch(syncConflictVariantUpdated(null));
    setNextBranch(null);
  }, [dispatch]);

  const handleSwitchBranchClick = useCallback(() => {
    setDropdownView("branch");
  }, []);

  if (!isVisible || !currentBranch) {
    return null;
  }

  return (
    <>
      <Combobox
        disabled={isLoading}
        position="bottom-start"
        store={combobox}
        width={280}
        withinPortal
      >
        <Combobox.Target>
          <Button
            p="sm"
            size="compact-sm"
            bd="none"
            mr="lg"
            disabled={isLoading}
            onClick={() => {
              setDropdownView("options");
              combobox.toggleDropdown();
            }}
            leftSection={
              <Icon name="git_branch" c="text-secondary" size={14} />
            }
            rightSection={
              isLoading ? (
                <Loader size="xs" />
              ) : (
                <Icon
                  name="chevrondown"
                  c="text-secondary"
                  size={8}
                  className={cx(S.chevronIcon, {
                    [S.opened]: combobox.dropdownOpened,
                  })}
                />
              )
            }
            data-testid="git-sync-controls"
          >
            <Text fw="bold" c="text-secondary" size="sm" lh="md" truncate>
              {currentBranch}
            </Text>
          </Button>
        </Combobox.Target>

        {dropdownView === "options" ? (
          <GitSyncOptionsDropdown
            isPullDisabled={!hasRemoteChanges}
            isPushDisabled={!isDirty || isLoading}
            onPullClick={handlePullClick}
            onPushClick={handlePushClick}
            onSwitchBranchClick={handleSwitchBranchClick}
          />
        ) : (
          <BranchDropdown
            baseBranch={currentBranch}
            combobox={combobox}
            onChange={handleBranchSelect}
            value={currentBranch}
          />
        )}
      </Combobox>

      {showPushModal && (
        <PushChangesModal
          currentBranch={currentBranch}
          onClose={togglePushModal}
        />
      )}

      {conflictVariant && (
        <SyncConflictModal
          currentBranch={currentBranch}
          nextBranch={nextBranch}
          onClose={handleCloseSyncConflictModal}
          variant={conflictVariant}
        />
      )}
    </>
  );
};
