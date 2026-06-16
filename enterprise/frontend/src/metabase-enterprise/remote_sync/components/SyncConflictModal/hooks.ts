import { useCallback, useState } from "react";
import { c, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  useCreateBranchMutation,
  useExportChangesMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import {
  type SyncError,
  parseSyncError,
} from "metabase-enterprise/remote_sync/utils";

import { trackBranchCreated, trackPushChanges } from "../../analytics";

export const usePushChangesAction = () => {
  const [exportChanges, { isLoading: isPushingChanges }] =
    useExportChangesMutation();
  const [sendToast] = useToast();

  return {
    pushChanges: useCallback(
      async (
        branch: string,
        force: boolean,
        closeModal: VoidFunction,
        message?: string,
      ) => {
        try {
          await exportChanges({
            branch,
            force,
            message,
          }).unwrap();

          trackPushChanges({
            triggeredFrom: "conflict-modal",
            force,
          });

          sendToast({
            message: c("{0} is the GitHub branch name")
              .t`Pushing changes to branch ${branch}...`,
          });
          closeModal();
        } catch (error) {
          const { errorMessage } = parseSyncError(error as SyncError);
          sendToast({
            message: errorMessage || t`Failed to push changes`,
            icon: "warning",
            timeout: 8000,
          });
        }
      },
      [exportChanges, sendToast],
    ),
    isPushingChanges,
  };
};

export const useMergeChangesAction = () => {
  const [exportChanges, { isLoading: isMerging }] = useExportChangesMutation();
  const [sendToast] = useToast();

  return {
    mergeChanges: useCallback(
      async (branch: string, closeModal: VoidFunction, message?: string) => {
        try {
          await exportChanges({
            branch,
            merge: true,
            message,
          }).unwrap();

          trackPushChanges({
            triggeredFrom: "conflict-modal",
            force: false,
          });

          sendToast({
            message: c("{0} is the GitHub branch name")
              .t`Merging remote changes and pushing to ${branch}...`,
          });
          closeModal();
        } catch (error) {
          const { errorMessage } = parseSyncError(error as SyncError);
          sendToast({
            message: errorMessage || t`Failed to merge changes`,
            icon: "warning",
            timeout: 8000,
          });
        }
      },
      [exportChanges, sendToast],
    ),
    isMerging,
  };
};

export const useMergeImportAction = () => {
  const [importChanges, { isLoading: isMergingImport }] =
    useImportChangesMutation();
  const [sendToast] = useToast();

  return {
    mergeImport: useCallback(
      async (branch: string, closeModal: VoidFunction) => {
        try {
          // Pull merge: the operational branch is the current branch, so it doubles as the
          // expected_branch assertion.
          await importChanges({
            branch,
            merge: true,
            expected_branch: branch,
          }).unwrap();

          sendToast({
            message: t`Merging the latest remote changes into your local content...`,
          });
          closeModal();
        } catch (error) {
          const { errorMessage } = parseSyncError(error as SyncError);
          sendToast({
            message: errorMessage || t`Failed to merge changes`,
            icon: "warning",
            timeout: 8000,
          });
        }
      },
      [importChanges, sendToast],
    ),
    isMergingImport,
  };
};

export const useStashToNewBranchAction = (existingBranches: string[]) => {
  const [exportChanges] = useExportChangesMutation();
  const [createBranch] = useCreateBranchMutation();
  const [isStashing, setIsStashing] = useState<boolean>(false);
  const [sendToast] = useToast();

  return {
    stashToNewBranch: useCallback(
      async (
        newBranchName: string,
        closeModal: VoidFunction,
        message?: string,
      ) => {
        if (!newBranchName) {
          sendToast({
            message: t`Please enter a valid branch name`,
            icon: "warning",
          });
          return;
        }

        if (existingBranches.includes(newBranchName)) {
          sendToast({
            message: t`This branch name already exists`,
            icon: "warning",
          });
          return;
        }

        try {
          setIsStashing(true);
          await createBranch({ name: newBranchName }).unwrap();

          trackBranchCreated({
            triggeredFrom: "conflict-modal",
          });

          await exportChanges({
            branch: newBranchName,
            message,
          }).unwrap();
          sendToast({
            message: c("{0} is the GitHub branch name")
              .t`Changes pushed to new branch ${newBranchName}`,
            timeout: 8000,
          });
          closeModal();
        } catch (error) {
          sendToast({
            message: t`Failed to push changes to new branch`,
            icon: "warning",
          });
        } finally {
          setIsStashing(false);
        }
      },
      [createBranch, existingBranches, exportChanges, sendToast],
    ),
    isStashing,
  };
};

export const useDiscardChangesAndImportAction = () => {
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [sendToast] = useToast();

  return {
    discardChangesAndImport: useCallback(
      async (
        targetBranch: string,
        expectedBranch: string,
        closeModal: VoidFunction,
      ) => {
        try {
          // targetBranch is what we import (may be a switch target); expectedBranch is the branch
          // we believe is currently active, asserted against the setting to catch a stale tab.
          await importChanges({
            branch: targetBranch,
            force: true,
            expected_branch: expectedBranch,
          }).unwrap();
          closeModal();
        } catch (error) {
          const { errorMessage } = parseSyncError(error as SyncError);
          sendToast({
            message:
              errorMessage ||
              c("{0} is the GitHub branch name")
                .t`Failed to import from branch ${targetBranch}`,
            icon: "warning",
          });
        }
      },
      [importChanges, sendToast],
    ),
    isImporting,
  };
};
