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
      async (branch: string, force: boolean, closeModal: VoidFunction) => {
        try {
          await exportChanges({
            branch,
            force,
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

export const useStashToNewBranchAction = (existingBranches: string[]) => {
  const [exportChanges] = useExportChangesMutation();
  const [createBranch] = useCreateBranchMutation();
  const [isStashing, setIsStashing] = useState<boolean>(false);
  const [sendToast] = useToast();

  return {
    stashToNewBranch: useCallback(
      async (newBranchName: string, closeModal: VoidFunction) => {
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
      async (targetBranch: string, closeModal: VoidFunction) => {
        try {
          await importChanges({ branch: targetBranch, force: true }).unwrap();
          closeModal();
        } catch (error) {
          sendToast({
            message: c("{0} is the GitHub branch name")
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
