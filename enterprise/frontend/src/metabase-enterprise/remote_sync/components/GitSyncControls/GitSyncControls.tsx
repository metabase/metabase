import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
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
import {
  getCurrentTask,
  getSyncConflictVariant,
} from "metabase-enterprise/remote_sync/selectors";
import {
  syncConflictVariantUpdated,
  taskCleared,
} from "metabase-enterprise/remote_sync/sync-task-slice";
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
  // True while the export preflight runs (push, or a dirty pull): it re-serializes the whole library and
  // reads the remote trees, so it can take a few seconds — show the control as busy meanwhile.
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [showPushModal, { toggle: togglePushModal }] = useDisclosure(false);
  const [sendToast] = useToast();
  const [dropdownView, setDropdownView] = useState<DropdownView>("options");
  const combobox = useCombobox();

  const { isDirty, refetch: refetchDirty } = useRemoteSyncDirtyState();

  // An export task that ends in conflict (the push lost the preflight->execute race, or fell through a
  // preflight error) is otherwise silent: the middleware can't toast (no hook), so surface it here, then
  // clear the task so it doesn't re-fire on re-render/navigation.
  const currentTask = useSelector(getCurrentTask);
  useEffect(() => {
    if (
      currentTask?.status === "conflict" &&
      currentTask?.sync_task_type === "export"
    ) {
      sendToast({
        icon: "warning",
        message: t`The remote branch changed before your push finished. Pull the latest changes, then push again.`,
      });
      dispatch(taskCleared());
    }
  }, [currentTask, sendToast, dispatch]);

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
  const isLoading =
    isSyncTaskRunning ||
    isSwitchingBranch ||
    isImporting ||
    isCheckingPreflight;

  // If `error` is a branch-mismatch rejection (another session switched branches), open the
  // out-of-date modal prompting a refresh and return true so the caller can stop. Returns false for
  // any other error so the caller can handle it normally.
  const showBranchMismatchIfPresent = useCallback((error: unknown): boolean => {
    const {
      hasBranchMismatch,
      errorMessage,
      currentBranch: serverBranch,
    } = parseSyncError(error as SyncError);
    if (hasBranchMismatch) {
      setBranchMismatch({
        message: errorMessage ?? t`The sync branch changed in another session.`,
        currentBranch: serverBranch,
      });
      return true;
    }
    return false;
  }, []);

  const changeBranch = useCallback(
    async (branch: string | null, isNewBranch?: boolean) => {
      if (branch == null) {
        console.warn("Trying to switch to null branch");
        return;
      }

      if (!isNewBranch) {
        if (currentBranch == null) {
          return;
        }
        // expected_branch is the branch we're switching away from: reject if another session already
        // moved off it, so we don't switch from a stale base. unwrap() so a rejection (e.g. the CAS 409)
        // throws and reaches handleBranchSelect's catch instead of resolving silently.
        await importChanges({
          branch,
          expected_branch: currentBranch,
        }).unwrap();

        trackBranchSwitched({
          triggeredFrom: "app-bar",
        });
      }

      setNextBranch(null);
    },
    [importChanges, currentBranch],
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
      } catch (error) {
        setNextBranch(null);
        if (showBranchMismatchIfPresent(error)) {
          return;
        }
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: t`Sorry, we were unable to switch branches.`,
        });
      }
    },
    [
      currentBranch,
      refetchDirty,
      dispatch,
      changeBranch,
      sendToast,
      showBranchMismatchIfPresent,
    ],
  );

  const handlePushClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    combobox.closeDropdown();

    // Find out up front whether the remote has advanced, so we open the right modal directly instead of
    // collecting a commit message and only then discovering the divergence.
    setIsCheckingPreflight(true);
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
      // Another session switched branches under us, so the branch shown here is stale. Don't fall
      // through to a push that would target the wrong branch — surface it and prompt a refresh.
      if (showBranchMismatchIfPresent(error)) {
        return;
      }
      // fall through to the plain push modal on any other preflight error
    } finally {
      setIsCheckingPreflight(false);
    }
    togglePushModal();
  }, [
    combobox,
    currentBranch,
    dispatch,
    runExportPreflight,
    togglePushModal,
    showBranchMismatchIfPresent,
  ]);

  const handlePullClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    combobox.closeDropdown();

    // With un-pushed local changes, a straight pull would clobber them. Check whether a clean local
    // merge is possible and let the user choose (merge / force / new branch / discard).
    if (isDirty) {
      setIsCheckingPreflight(true);
      try {
        const preflight = await runExportPreflight({
          branch: currentBranch,
        }).unwrap();
        setConflictPreflight(preflight);
      } catch (error) {
        if (showBranchMismatchIfPresent(error)) {
          return;
        }
        // Couldn't determine mergeability; open the modal without the merge option but tell the user why.
        setConflictPreflight(null);
        sendToast({
          message: t`Couldn't check whether your changes can be merged. You can still force the pull or stash to a new branch.`,
          icon: "warning",
        });
      } finally {
        setIsCheckingPreflight(false);
      }
      dispatch(syncConflictVariantUpdated("pull"));
      return;
    }

    try {
      await importChanges({
        branch: currentBranch,
        expected_branch: currentBranch,
      }).unwrap();

      trackPullChanges({
        triggeredFrom: "app-bar",
        force: false,
      });
    } catch (error) {
      if (showBranchMismatchIfPresent(error)) {
        return;
      }

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
    showBranchMismatchIfPresent,
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
          forcePushCasualties={conflictPreflight?.force_push_casualties}
          historyRewritten={conflictPreflight?.reason === "history-rewritten"}
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
