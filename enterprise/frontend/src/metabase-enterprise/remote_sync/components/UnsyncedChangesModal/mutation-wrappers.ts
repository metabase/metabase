import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import {
  useCreateBranchMutation,
  useExportChangesMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

export const usePushChangesAction = () => {
  const [exportChanges, { isLoading: isPushingChanges }] =
    useExportChangesMutation();
  const [sendToast] = useToast();

  return {
    pushChanges: useCallback(
      async (
        currentBranch: string,
        forceSync: boolean,
        closeModal: VoidFunction,
      ) => {
        try {
          await exportChanges({
            branch: currentBranch,
            forceSync,
          }).unwrap();
          sendToast({
            message: t`Changes pushed. You can now switch branches.`,
            timeout: 8000,
          });
          closeModal();
        } catch (error) {
          sendToast({ message: t`Failed to push changes`, icon: "warning" });
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
            message: t`Changes pushed to new branch. You can now switch branches.`,
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

export const useDiscardChangesAndSwitchAction = (collections: Collection[]) => {
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [sendToast] = useToast();

  return {
    discardChangesAndSwitch: useCallback(
      async (nextBranch: string, closeModal: VoidFunction) => {
        try {
          await importChanges({ branch: nextBranch, force: true }).unwrap();
          closeModal();

          if (collections.length) {
            // Navigate to base the collection page with a full reload to make sure
            // the current page exists, and we don't have any dirty state left in the UI
            window.location.href = Urls.collection(collections[0]);
          }
        } catch (error) {
          sendToast({ message: t`Failed to switch branches`, icon: "warning" });
        }
      },
      [collections, importChanges, sendToast],
    ),
    isImporting,
  };
};
