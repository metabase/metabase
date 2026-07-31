import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  useDeleteWorktreeMutation,
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useImportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";
import type {
  ExportPreflightResponse,
  RemoteSyncWorktree,
} from "metabase-types/api";

import { trackPullChanges } from "../../analytics";
import { parseSyncError } from "../../utils";

/** A pull or push that found the worktree out of sync with its branch, waiting on the user's choice. */
export interface WorktreeConflict {
  variant: "pull" | "push";
  /** Mergeability details; null when the preflight failed or wasn't run (merge option unavailable). */
  preflight: ExportPreflightResponse | null;
}

/**
 * Sync state and actions for one worktree: whether it has unsynced changes,
 * whether its branch has advanced, and the pull / push / delete handlers,
 * including the conflict resolution and push modals' state.
 */
export const useWorktreeSyncActions = (worktree: RemoteSyncWorktree) => {
  const [sendToast] = useToast();
  const [importChanges] = useImportChangesMutation();
  const [deleteWorktree] = useDeleteWorktreeMutation();
  const [runExportPreflight] = useLazyGetExportPreflightQuery();

  const { data: dirtyData } = useGetRemoteSyncHasChangesQuery(
    { worktree_id: worktree.id },
    { refetchOnFocus: true },
  );
  const isDirty = dirtyData?.is_dirty ?? false;

  // Only checked while the actions menu is open: it hits the remote, so don't poll for every
  // worktree row that just sits in the sidebar.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const {
    currentData: remoteChangesData,
    isFetching: isFetchingRemoteChanges,
    isError: hasRemoteChangesError,
  } = useGetHasRemoteChangesQuery(
    { worktree_id: worktree.id },
    {
      skip: !isMenuOpen,
      refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
    },
  );
  // When the check errors out, leave Pull enabled — the pull itself will surface the problem.
  const isPullDisabled =
    isFetchingRemoteChanges ||
    (!hasRemoteChangesError && remoteChangesData?.has_changes === false);

  // While a preflight runs (push, or a dirty pull), the row's menu button shows as busy.
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);
  const [conflict, setConflict] = useState<WorktreeConflict | null>(null);
  const closeConflict = useCallback(() => setConflict(null), []);

  const [isPushModalOpen, { open: openPushModal, close: closePushModal }] =
    useDisclosure(false);

  const handlePull = useCallback(async () => {
    // With un-pushed worktree changes, a straight pull would clobber them. Check whether a clean
    // merge is possible and let the user choose (merge / force / discard).
    if (isDirty) {
      setIsCheckingPreflight(true);
      let preflight: ExportPreflightResponse | null = null;
      try {
        preflight = await runExportPreflight({
          branch: worktree.branch,
          worktree_id: worktree.id,
        }).unwrap();
      } catch (error) {
        // Couldn't determine mergeability; open the modal without the merge option but tell the user why.
        sendToast({
          message: t`Couldn't check whether your changes can be merged. You can still force the pull.`,
          icon: "warning",
        });
      } finally {
        setIsCheckingPreflight(false);
      }
      setConflict({ variant: "pull", preflight });
      return;
    }

    try {
      await importChanges({
        branch: worktree.branch,
        expected_branch: worktree.branch,
        worktree_id: worktree.id,
      }).unwrap();

      trackPullChanges({ triggeredFrom: "app-bar", force: false });
    } catch (error) {
      const { hasConflict, errorMessage } = parseSyncError(error);
      if (hasConflict) {
        setConflict({ variant: "pull", preflight: null });
        return;
      }
      sendToast({
        message: errorMessage || t`Failed to pull into the worktree`,
        icon: "warning",
      });
    }
  }, [importChanges, isDirty, runExportPreflight, sendToast, worktree]);

  const handlePush = useCallback(async () => {
    // Find out up front whether the branch has advanced, so we open the right modal directly instead
    // of collecting a commit message and only then discovering the divergence.
    setIsCheckingPreflight(true);
    try {
      const preflight = await runExportPreflight({
        branch: worktree.branch,
        worktree_id: worktree.id,
      }).unwrap();
      if (preflight.has_changes) {
        setConflict({ variant: "push", preflight });
        return;
      }
    } catch (error) {
      // fall through to the plain push modal on any preflight error
    } finally {
      setIsCheckingPreflight(false);
    }
    openPushModal();
  }, [openPushModal, runExportPreflight, worktree]);

  const handleDelete = useCallback(async (): Promise<boolean> => {
    try {
      await deleteWorktree(worktree.id).unwrap();
      sendToast({ message: t`Worktree "${worktree.branch}" deleted` });
      return true;
    } catch (error) {
      const { errorMessage } = parseSyncError(error);
      sendToast({
        message: errorMessage || t`Failed to delete the worktree`,
        icon: "warning",
      });
      return false;
    }
  }, [deleteWorktree, sendToast, worktree]);

  return {
    isDirty,
    isPullDisabled,
    isFetchingRemoteChanges,
    isCheckingPreflight,
    isMenuOpen,
    setIsMenuOpen,
    conflict,
    closeConflict,
    isPushModalOpen,
    closePushModal,
    handlePull,
    handlePush,
    handleDelete,
  };
};
