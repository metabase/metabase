import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import {
  Button,
  Combobox,
  Group,
  Icon,
  Loader,
  Modal,
  Text,
  useCombobox,
} from "metabase/ui";
import {
  useGetHasRemoteChangesQuery,
  useImportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";
import { getSyncConflictVariant } from "metabase-enterprise/remote_sync/selectors";
import { syncConflictVariantUpdated } from "metabase-enterprise/remote_sync/sync-task-slice";
import type { ExportPreflightResponse } from "metabase-types/api";

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
  const { isVisible, currentBranch, isBranchSetByEnv } = useGitSyncVisible();

  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [runExportPreflight] = useLazyGetExportPreflightQuery();
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  const [nextBranch, setNextBranch] = useState<string | null>(null);
  // Set when a push or pull needs the conflict modal; carries whether a clean merge is available.
  const [conflictPreflight, setConflictPreflight] =
    useState<ExportPreflightResponse | null>(null);
  // Set when the backend rejects an action because the branch changed in another session.
  const [branchMismatch, setBranchMismatch] = useState<{
    message: string;
    currentBranch: string | null;
  } | null>(null);
  const [showPushModal, { toggle: togglePushModal }] = useDisclosure(false);
  const [sendToast] = useToast();
  const [dropdownView, setDropdownView] = useState<DropdownView>("options");
  const combobox = useCombobox();

  const { isDirty, refetch: refetchDirty } = useRemoteSyncDirtyState();

  const {
    currentData: hasRemoteChangesData,
    isFetching: isFetchingRemoteChanges,
    isError: hasRemoteChangesError,
  } = useGetHasRemoteChangesQuery(undefined, {
    refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
    skip: !combobox.dropdownOpened,
  });
  const { has_changes: hasRemoteChanges } = hasRemoteChangesData || {};

  const isSwitchingBranch = !!nextBranch;
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

  const handlePushClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    combobox.closeDropdown();

    // Find out up front whether the remote has advanced, so we open the right modal directly instead of
    // collecting a commit message and only then discovering the divergence.
    try {
      const preflight = await runExportPreflight({
        branch: currentBranch,
      }).unwrap();
      if (preflight.has_changes) {
        setConflictPreflight(preflight);
        dispatch(syncConflictVariantUpdated("push"));
        return;
      }
    } catch (error) {
      const {
        hasBranchMismatch,
        errorMessage,
        currentBranch: serverBranch,
      } = parseSyncError(error as SyncError);
      if (hasBranchMismatch) {
        // Another session switched branches under us, so the branch shown here is stale. Don't fall
        // through to a push that would target the wrong branch — surface it and prompt a refresh.
        setBranchMismatch({
          message:
            errorMessage ?? t`The sync branch changed in another session.`,
          currentBranch: serverBranch,
        });
        return;
      }
      // fall through to the plain push modal on any other preflight error
    }
    togglePushModal();
  }, [combobox, currentBranch, dispatch, runExportPreflight, togglePushModal]);

  const handlePullClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    combobox.closeDropdown();

    // With un-pushed local changes, a straight pull would clobber them. Check whether a clean local
    // merge is possible and let the user choose (merge / force / new branch / discard).
    if (isDirty) {
      try {
        const preflight = await runExportPreflight({
          branch: currentBranch,
        }).unwrap();
        setConflictPreflight(preflight);
      } catch (error) {
        const {
          hasBranchMismatch,
          errorMessage,
          currentBranch: serverBranch,
        } = parseSyncError(error as SyncError);
        if (hasBranchMismatch) {
          setBranchMismatch({
            message:
              errorMessage ?? t`The sync branch changed in another session.`,
            currentBranch: serverBranch,
          });
          return;
        }
        setConflictPreflight(null);
      }
      dispatch(syncConflictVariantUpdated("pull"));
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
        setConflictPreflight(null);
        dispatch(syncConflictVariantUpdated("pull"));
        return;
      }

      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }
  }, [
    combobox,
    currentBranch,
    dispatch,
    importChanges,
    isDirty,
    runExportPreflight,
    sendToast,
  ]);

  const handleCloseSyncConflictModal = useCallback(() => {
    dispatch(syncConflictVariantUpdated(null));
    setNextBranch(null);
    setConflictPreflight(null);
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
            isPullError={hasRemoteChangesError}
            isLoadingPull={isFetchingRemoteChanges}
            isPushDisabled={!isDirty || isLoading}
            isSwitchBranchDisabled={isBranchSetByEnv}
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
          canMerge={conflictPreflight?.clean}
          conflicts={conflictPreflight?.conflicts}
        />
      )}

      {branchMismatch && (
        <Modal
          opened
          padding="xl"
          title={t`This view is out of date`}
          withCloseButton={false}
          onClose={() => setBranchMismatch(null)}
        >
          <Text mt="md">{branchMismatch.message}</Text>
          <Group gap="sm" justify="end" mt="xl">
            <Button variant="subtle" onClick={() => setBranchMismatch(null)}>
              {t`Cancel`}
            </Button>
            <Button variant="filled" onClick={() => window.location.reload()}>
              {t`Refresh`}
            </Button>
          </Group>
        </Modal>
      )}
    </>
  );
};
