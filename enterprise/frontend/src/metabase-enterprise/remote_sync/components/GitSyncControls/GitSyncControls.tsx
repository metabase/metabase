import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Icon, Loader, Menu, Text } from "metabase/ui";
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
  worktreeChanged,
} from "metabase-enterprise/remote_sync/sync-task-slice";
import type { ExportPreflightResponse } from "metabase-types/api";

import { trackPullChanges } from "../../analytics";
import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";
import { useSyncStatus } from "../../hooks/use-sync-status";
import { type SyncError, parseSyncError } from "../../utils";
import { EnterWorktreeModal } from "../EnterWorktreeModal";
import { PushChangesModal } from "../PushChangesModal";
import { SyncConflictModal } from "../SyncConflictModal";

import S from "./GitSyncControls.module.css";
import { GitSyncOptionsDropdown } from "./GitSyncOptionsDropdown";

export const GitSyncControls = () => {
  const dispatch = useDispatch();
  const conflictVariant = useSelector(getSyncConflictVariant);
  // Branch switching now lives in the instance Settings panel (behind destructive-action guard rails),
  // so these controls show the current branch read-only and expose only Push/Pull.
  const { isVisible, isReadWrite, currentBranch, isInWorktree } =
    useGitSyncVisible();

  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [runExportPreflight] = useLazyGetExportPreflightQuery();
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  // Set when a push or pull needs the conflict modal; carries whether a clean merge is available.
  const [conflictPreflight, setConflictPreflight] =
    useState<ExportPreflightResponse | null>(null);
  // True while the export preflight runs (push, or a dirty pull): it re-serializes the whole library and
  // reads the remote trees, so it can take a few seconds — show the control as busy meanwhile.
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [showPushModal, { toggle: togglePushModal }] = useDisclosure(false);
  const [isMenuOpened, { toggle: toggleMenu, close: closeMenu }] =
    useDisclosure(false);
  const [
    showEnterWorktreeModal,
    { open: openEnterWorktreeModal, close: closeEnterWorktreeModal },
  ] = useDisclosure(false);
  const [sendToast] = useToast();

  const { isDirty } = useRemoteSyncDirtyState();

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
    skip: !isMenuOpened,
  });
  const { has_changes: hasRemoteChanges } = hasRemoteChangesData || {};

  const isLoading = isSyncTaskRunning || isImporting || isCheckingPreflight;

  const handlePushClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    closeMenu();

    // Find out up front whether the remote has advanced, so we open the right modal directly instead of
    // collecting a commit message and only then discovering the divergence.
    setIsCheckingPreflight(true);
    try {
      const preflight = await runExportPreflight().unwrap();
      if (preflight.has_changes) {
        setConflictPreflight(preflight);
        dispatch(syncConflictVariantUpdated("push"));
        return;
      }
    } catch {
    } finally {
      setIsCheckingPreflight(false);
    }
    togglePushModal();
  }, [closeMenu, currentBranch, dispatch, runExportPreflight, togglePushModal]);

  const handlePullClick = useCallback(async () => {
    if (!currentBranch) {
      return;
    }

    closeMenu();

    // With un-pushed local changes, a straight pull would clobber them. Check whether a clean local
    // merge is possible and let the user choose (merge / force / new branch / discard).
    if (isDirty) {
      setIsCheckingPreflight(true);
      try {
        const preflight = await runExportPreflight().unwrap();
        setConflictPreflight(preflight);
      } catch {
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
      await importChanges({ branch: currentBranch }).unwrap();

      trackPullChanges({
        triggeredFrom: "app-bar",
        force: false,
      });
    } catch (error) {
      // Unjustified type cast. FIXME
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
    closeMenu,
    currentBranch,
    dispatch,
    importChanges,
    isDirty,
    runExportPreflight,
    sendToast,
  ]);

  const handleCloseSyncConflictModal = useCallback(() => {
    dispatch(syncConflictVariantUpdated(null));
    setConflictPreflight(null);
  }, [dispatch]);

  if (!isVisible || !currentBranch) {
    return null;
  }

  const hasSyncActions = isReadWrite || isInWorktree;

  return (
    <>
      <Menu
        opened={isMenuOpened}
        position="bottom-start"
        width={280}
        withinPortal
        onChange={toggleMenu}
      >
        <Menu.Target>
          <Button
            variant="subtle"
            color="neutral"
            mr="xl"
            disabled={isLoading}
            onClick={toggleMenu}
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
                    [S.opened]: isMenuOpened,
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
        </Menu.Target>

        <GitSyncOptionsDropdown
          isPullDisabled={!hasRemoteChanges}
          isPullError={hasRemoteChangesError}
          isLoadingPull={isFetchingRemoteChanges}
          isPushDisabled={!isDirty || isLoading}
          hasSyncActions={hasSyncActions}
          isInWorktree={isInWorktree}
          onPullClick={handlePullClick}
          onPushClick={handlePushClick}
          onEnterWorktreeClick={() => {
            closeMenu();
            openEnterWorktreeModal();
          }}
          onLeaveWorktreeClick={() => {
            closeMenu();
            dispatch(worktreeChanged(null));
          }}
        />
      </Menu>

      <EnterWorktreeModal
        opened={showEnterWorktreeModal}
        onClose={closeEnterWorktreeModal}
      />

      <PushChangesModal opened={showPushModal} onClose={togglePushModal} />

      {conflictVariant && (
        <SyncConflictModal
          opened
          currentBranch={currentBranch}
          variant={conflictVariant}
          canMerge={conflictPreflight?.clean}
          conflicts={conflictPreflight?.conflicts}
          forcePushCasualties={conflictPreflight?.force_push_casualties}
          historyRewritten={conflictPreflight?.reason === "history-rewritten"}
          onClose={handleCloseSyncConflictModal}
        />
      )}
    </>
  );
};
