import { useCallback, useState } from "react";
import { c, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import {
  useCreateBranchMutation,
  useExportChangesMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import {
  type SyncError,
  parseSyncError,
} from "metabase-enterprise/remote_sync/utils";
import type { Collection } from "metabase-types/api";

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
          sendToast({
            message: c("{0} is the GitHub branch name")
              .t`Changes pushed to branch ${branch} successfully.`,
            timeout: 8000,
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

export const useDiscardChangesAndImportAction = (collections: Collection[]) => {
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [sendToast] = useToast();

  return {
    discardChangesAndImport: useCallback(
      async (targetBranch: string, closeModal: VoidFunction) => {
        try {
          await importChanges({ branch: targetBranch, force: true }).unwrap();
          closeModal();

          if (collections.length) {
            // Navigate to base the collection page with a full reload to make sure
            // the current page exists, and we don't have any dirty state left in the UI
            window.location.href = Urls.collection(collections[0]);
          }
        } catch (error) {
          sendToast({
            message: c("{0} is the GitHub branch name")
              .t`Failed to import from branch ${targetBranch}`,
            icon: "warning",
          });
        }
      },
      [collections, importChanges, sendToast],
    ),
    isImporting,
  };
};
