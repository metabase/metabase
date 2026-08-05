import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import {
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useImportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";
import type {
  ExportPreflightResponse,
  RemoteSyncConflictVariant,
  Worktree,
} from "metabase-types/api";

import { trackPullChanges } from "../analytics";
import { PushChangesModal } from "../components/PushChangesModal";
import { SyncConflictModal } from "../components/SyncConflictModal";
import { useSyncStatus } from "../hooks/use-sync-status";
import { getCurrentTask, getIsRemoteSyncReadOnly } from "../selectors";
import { taskCleared } from "../sync-task-slice";
import { parseSyncError } from "../utils";

type WorktreeConflictVariant = Extract<
  RemoteSyncConflictVariant,
  "push" | "pull"
>;

// The backend caches has-remote-changes lookups, so refetching on remount is cheap; the age cap
// keeps a long-lived subscriber from going stale.
const REMOTE_CHANGES_MAX_AGE_SECONDS = 30;

type UseWorktreeSyncActionsOptions = {
  /**
   * Run the status queries (is-dirty / has-remote-changes). Pass false while the UI showing them is
   * hidden — e.g. a closed nav menu — so every worktree in the sidebar doesn't query on mount.
   */
  enabled?: boolean;
  /**
   * Render the task progress modal and surface conflict-task feedback from this instance. Exactly
   * one mounted instance per worktree should own this, or modals and toasts double up: the banner
   * owns it inside the worktree, the nav menu outside.
   */
  ownsTaskFeedback?: boolean;
};

/**
 * Pull/push flow for a worktree: sync status, the preflight-first pull/push handlers, and the modals
 * they open. The equivalent of GitSyncControls' logic for the main app, minus branch management: a
 * worktree is pinned to its branch for its whole life, so there is no branch switching and no
 * branch-mismatch handling. Render `modals` next to whatever triggers the actions.
 */
export function useWorktreeSyncActions(
  worktree: Worktree,
  {
    enabled = true,
    ownsTaskFeedback = true,
  }: UseWorktreeSyncActionsOptions = {},
) {
  const worktreeId = worktree.id;
  const branch = worktree.branch;

  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const { data: dirtyData } = useGetRemoteSyncHasChangesQuery(
    { "worktree-id": worktreeId },
    { skip: !enabled },
  );
  const isDirty = dirtyData?.is_dirty ?? false;

  const { data: remoteChangesData, isFetching: isFetchingRemoteChanges } =
    useGetHasRemoteChangesQuery(
      { "worktree-id": worktreeId },
      {
        skip: !enabled,
        refetchOnMountOrArgChange: REMOTE_CHANGES_MAX_AGE_SECONDS,
      },
    );
  const hasRemoteChanges = remoteChangesData?.has_changes ?? false;

  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [runExportPreflight] = useLazyGetExportPreflightQuery();

  const { isRunning: isSyncTaskRunning, progressModal } = useSyncStatus({
    worktreeId,
  });

  // Set when a push or pull needs the conflict modal; carries whether a clean merge is available.
  const [conflictPreflight, setConflictPreflight] =
    useState<ExportPreflightResponse | null>(null);
  const [conflictVariant, setConflictVariant] =
    useState<WorktreeConflictVariant | null>(null);
  // True while the export preflight runs (push, or a dirty pull): it re-serializes the worktree and
  // reads the remote trees, so it can take a few seconds — show the controls as busy meanwhile.
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [showPushModal, { toggle: togglePushModal }] = useDisclosure(false);

  const isSyncing = isSyncTaskRunning || isImporting || isCheckingPreflight;

  // A task that ends in conflict is otherwise silent (the middleware can't toast). An export conflict
  // means the push lost the preflight->execute race; an import conflict means the pull ran into local
  // changes — reopen the pull options so the user can merge or discard.
  const currentTask = useSelector(getCurrentTask);
  useEffect(() => {
    if (
      !ownsTaskFeedback ||
      currentTask?.status !== "conflict" ||
      currentTask.worktree_id !== worktreeId
    ) {
      return;
    }
    if (currentTask.sync_task_type === "export") {
      sendToast({
        icon: "warning",
        message: t`The remote branch changed before your push finished. Pull the latest changes, then push again.`,
      });
    } else {
      setConflictPreflight(null);
      setConflictVariant("pull");
    }
    dispatch(taskCleared());
  }, [ownsTaskFeedback, currentTask, worktreeId, sendToast, dispatch]);

  const push = useCallback(async () => {
    // Find out up front whether the remote has advanced, so we open the right modal directly instead
    // of collecting a commit message and only then discovering the divergence.
    setIsCheckingPreflight(true);
    try {
      const preflight = await runExportPreflight({
        branch,
        "worktree-id": worktreeId,
      }).unwrap();
      if (preflight.has_changes) {
        setConflictPreflight(preflight);
        setConflictVariant("push");
        return;
      }
    } catch (error) {
      // fall through to the plain push modal on any preflight error
    } finally {
      setIsCheckingPreflight(false);
    }
    togglePushModal();
  }, [branch, worktreeId, runExportPreflight, togglePushModal]);

  const pull = useCallback(async () => {
    // With un-pushed local changes, a straight pull would clobber them. Check whether a clean local
    // merge is possible and let the user choose (merge / force / discard).
    if (isDirty) {
      setIsCheckingPreflight(true);
      try {
        const preflight = await runExportPreflight({
          branch,
          "worktree-id": worktreeId,
        }).unwrap();
        setConflictPreflight(preflight);
      } catch (error) {
        // Couldn't determine mergeability; open the modal without the merge option but tell the user why.
        setConflictPreflight(null);
        sendToast({
          message: t`Couldn't check whether your changes can be merged. You can still force the pull.`,
          icon: "warning",
        });
      } finally {
        setIsCheckingPreflight(false);
      }
      setConflictVariant("pull");
      return;
    }

    try {
      await importChanges({
        branch,
        expected_branch: branch,
        worktree_id: worktreeId,
      }).unwrap();

      trackPullChanges({
        triggeredFrom: "worktree",
        force: false,
      });
    } catch (error) {
      const { hasConflict, errorMessage } = parseSyncError(error);

      if (hasConflict) {
        setConflictPreflight(null);
        setConflictVariant("pull");
        return;
      }

      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }
  }, [
    branch,
    worktreeId,
    importChanges,
    isDirty,
    runExportPreflight,
    sendToast,
  ]);

  const handleCloseSyncConflictModal = useCallback(() => {
    setConflictVariant(null);
    setConflictPreflight(null);
  }, []);

  const modals = (
    <>
      {showPushModal && (
        <PushChangesModal
          currentBranch={branch}
          worktreeId={worktreeId}
          onClose={togglePushModal}
        />
      )}

      {conflictVariant && (
        <SyncConflictModal
          currentBranch={branch}
          worktreeId={worktreeId}
          onClose={handleCloseSyncConflictModal}
          variant={conflictVariant}
          canMerge={conflictPreflight?.clean}
          conflicts={conflictPreflight?.conflicts}
          forcePushCasualties={conflictPreflight?.force_push_casualties}
          historyRewritten={conflictPreflight?.reason === "history-rewritten"}
        />
      )}

      {ownsTaskFeedback && progressModal}
    </>
  );

  return {
    isDirty,
    hasRemoteChanges,
    isFetchingRemoteChanges,
    isReadOnly,
    isSyncing,
    isPullDisabled: isSyncing || !hasRemoteChanges,
    isPushDisabled: isSyncing || !isDirty,
    pull,
    push,
    modals,
  };
}
