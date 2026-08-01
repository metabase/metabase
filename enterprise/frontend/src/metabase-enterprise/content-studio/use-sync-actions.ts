import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useImportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";
import { trackPullChanges } from "metabase-enterprise/remote_sync/analytics";
import { parseSyncError } from "metabase-enterprise/remote_sync/utils";
import type {
  ExportPreflightResponse,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

/** A pull or push that found the branch out of sync, waiting on the user's choice. */
export interface SyncConflict {
  variant: "pull" | "push";
  /** Mergeability details; null when the preflight failed or wasn't run (merge option unavailable). */
  preflight: ExportPreflightResponse | null;
}

interface SyncActionsOptions {
  /** The branch being synced; null while it is still unknown. */
  branch: string | null;
  /** The branch's checkout, or null for the main branch. */
  worktreeId: RemoteSyncWorktreeId | null;
}

/**
 * Sync state and actions for one branch: whether it has unsynced changes, whether
 * the remote has advanced, and the pull / push handlers, including the state of the
 * conflict, push and out-of-date modals.
 */
export const useSyncActions = ({ branch, worktreeId }: SyncActionsOptions) => {
  const [sendToast] = useToast();
  const [importChanges] = useImportChangesMutation();
  const [runExportPreflight] = useLazyGetExportPreflightQuery();

  const scope = worktreeId != null ? { worktree_id: worktreeId } : undefined;

  const { data: dirtyData } = useGetRemoteSyncHasChangesQuery(scope, {
    refetchOnFocus: true,
  });
  const isDirty = dirtyData?.is_dirty ?? false;

  // Only checked while the actions menu is open: it hits the remote, so don't poll for a
  // control that just sits in the sidebar.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const {
    currentData: remoteChangesData,
    isFetching: isFetchingRemoteChanges,
    isError: hasRemoteChangesError,
  } = useGetHasRemoteChangesQuery(scope, {
    skip: !isMenuOpen,
    refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
  });
  const isBranchMissing = remoteChangesData?.branch_missing === true;
  // When the check errors out, leave Pull enabled — the pull itself will surface the problem.
  const isPullDisabled =
    isFetchingRemoteChanges ||
    isBranchMissing ||
    (!hasRemoteChangesError && remoteChangesData?.has_changes === false);

  // While a preflight runs (push, or a dirty pull), the control shows as busy.
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const closeConflict = useCallback(() => setConflict(null), []);

  const [branchMismatchMessage, setBranchMismatchMessage] = useState<
    string | null
  >(null);
  const closeBranchMismatch = useCallback(
    () => setBranchMismatchMessage(null),
    [],
  );

  const [isPushModalOpen, { open: openPushModal, close: closePushModal }] =
    useDisclosure(false);

  // If `error` is a branch-mismatch rejection (another session moved the branch on), open the
  // out-of-date modal prompting a refresh and return true so the caller can stop. Returns false
  // for any other error so the caller can handle it normally.
  const showBranchMismatchIfPresent = useCallback((error: unknown): boolean => {
    const { hasBranchMismatch, errorMessage } = parseSyncError(error);

    if (hasBranchMismatch) {
      setBranchMismatchMessage(
        errorMessage ?? t`The sync branch changed in another session.`,
      );
      return true;
    }

    return false;
  }, []);

  const handlePull = useCallback(async () => {
    if (branch == null) {
      return;
    }

    // With un-pushed local changes, a straight pull would clobber them. Check whether a clean
    // merge is possible and let the user choose (merge / force / discard).
    if (isDirty) {
      setIsCheckingPreflight(true);
      let preflight: ExportPreflightResponse | null = null;
      try {
        preflight = await runExportPreflight({
          branch,
          worktree_id: worktreeId ?? undefined,
        }).unwrap();
      } catch (error) {
        if (showBranchMismatchIfPresent(error)) {
          return;
        }
        // Couldn't determine mergeability; open the modal without the merge option but tell the user why.
        sendToast({
          message:
            worktreeId == null
              ? t`Couldn't check whether your changes can be merged. You can still force the pull or stash to a new branch.`
              : t`Couldn't check whether your changes can be merged. You can still force the pull.`,
          icon: "warning",
        });
      } finally {
        setIsCheckingPreflight(false);
      }
      setConflict({ variant: "pull", preflight });
      return;
    }

    try {
      const result = await importChanges({
        branch,
        expected_branch: branch,
        worktree_id: worktreeId ?? undefined,
      }).unwrap();

      trackPullChanges({ triggeredFrom: "content-studio", force: false });
      if (result.task_id == null) {
        // The backend skipped the pull because the branch hasn't moved; no task means
        // no progress modal, so acknowledge here.
        sendToast({ message: t`No changes to pull` });
      }
    } catch (error) {
      if (showBranchMismatchIfPresent(error)) {
        return;
      }

      const { hasConflict, errorMessage } = parseSyncError(error);
      if (hasConflict) {
        setConflict({ variant: "pull", preflight: null });
        return;
      }
      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }
  }, [
    branch,
    importChanges,
    isDirty,
    runExportPreflight,
    sendToast,
    showBranchMismatchIfPresent,
    worktreeId,
  ]);

  const handlePush = useCallback(async () => {
    if (branch == null) {
      return;
    }

    // Find out up front whether the remote has advanced, so we open the right modal directly instead
    // of collecting a commit message and only then discovering the divergence.
    setIsCheckingPreflight(true);
    try {
      const preflight = await runExportPreflight({
        branch,
        worktree_id: worktreeId ?? undefined,
      }).unwrap();
      if (preflight.has_changes) {
        setConflict({ variant: "push", preflight });
        return;
      }
    } catch (error) {
      if (showBranchMismatchIfPresent(error)) {
        return;
      }
      // fall through to the plain push modal on any other preflight error
    } finally {
      setIsCheckingPreflight(false);
    }
    openPushModal();
  }, [
    branch,
    openPushModal,
    runExportPreflight,
    showBranchMismatchIfPresent,
    worktreeId,
  ]);

  return {
    isDirty,
    isPullDisabled,
    isBranchMissing,
    isFetchingRemoteChanges,
    isCheckingPreflight,
    isMenuOpen,
    setIsMenuOpen,
    conflict,
    closeConflict,
    branchMismatchMessage,
    closeBranchMismatch,
    isPushModalOpen,
    closePushModal,
    handlePull,
    handlePush,
  };
};
