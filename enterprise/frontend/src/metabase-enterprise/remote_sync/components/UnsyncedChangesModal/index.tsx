import { useMemo, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import { Box, Button, Group, Modal } from "metabase/ui";
import {
  useCreateBranchMutation,
  useExportChangesMutation,
  useGetBranchesQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import { ChangesLists } from "../ChangesLists";

import { BranchNameInput } from "./BranchNameInput";
import { BranchSwitchOptions, type OptionValue } from "./BranchSwitchOptions";

interface UnsyncedWarningModalProps {
  collections: Collection[];
  currentBranch: string;
  nextBranch: string;
  onClose: VoidFunction;
}

export const UnsyncedChangesModal = (props: UnsyncedWarningModalProps) => {
  const { collections, onClose, currentBranch, nextBranch } = props;
  const [optionValue, setOptionValue] = useState<OptionValue>();
  const [newBranchName, setNewBranchName] = useState<string>("");
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [exportChanges, { isLoading: isExporting }] =
    useExportChangesMutation();
  const [createBranch, { isLoading: isCreatingBranch }] =
    useCreateBranchMutation();
  const { data: branchesData } = useGetBranchesQuery();
  const existingBranches = useMemo(
    () => branchesData?.items || [],
    [branchesData],
  );
  const [sendToast] = useToast();

  const handleContinueClick = async () => {
    if (!optionValue) {
      return;
    }

    if (optionValue === "push") {
      try {
        await exportChanges({
          branch: currentBranch,
        }).unwrap();
        sendToast({
          message: t`Changes pushed. You can now switch branches.`,
          timeout: 8000,
        });
        onClose();
      } catch (error) {
        sendToast({ message: t`Failed to push changes`, icon: "warning" });
      }
    }

    if (optionValue === "new-branch") {
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
        await createBranch({ name: newBranchName }).unwrap();
        await exportChanges({
          branch: newBranchName,
        }).unwrap();
        sendToast({
          message: t`Changes pushed to new branch. You can now switch branches.`,
          timeout: 8000,
        });
        onClose();
      } catch (error) {
        sendToast({
          message: t`Failed to push changes to new branch`,
          icon: "warning",
        });
      }
    }

    if (optionValue === "discard") {
      try {
        await importChanges({ branch: nextBranch, force: true }).unwrap();
        onClose();
        if (collections.length) {
          // Navigate to base the collection page with a full reload to make sure
          // the current page exists, and we don't have any dirty state left in the UI
          window.location.href = Urls.collection(collections[0]);
        }
      } catch (error) {
        sendToast({ message: t`Failed to switch branches`, icon: "warning" });
      }
    }
  };

  const isProcessing = isImporting || isExporting || isCreatingBranch;
  const isButtonDisabled = useMemo(() => {
    let disabled = !optionValue || isProcessing;

    if (optionValue === "new-branch") {
      disabled ||= !newBranchName || existingBranches.includes(newBranchName);
    }

    return disabled;
  }, [existingBranches, isProcessing, newBranchName, optionValue]);

  return (
    <Modal
      onClose={onClose}
      opened
      title={t`You have unsynced changes. What do you want to do?`}
      withCloseButton={false}
    >
      <Box pt="md">
        <ChangesLists collections={collections} />

        <BranchSwitchOptions
          currentBranch={currentBranch}
          handleOptionChange={setOptionValue}
          optionValue={optionValue}
        />

        {optionValue === "new-branch" && (
          <BranchNameInput
            existingBranches={existingBranches}
            setValue={setNewBranchName}
            value={newBranchName}
          />
        )}

        <Group gap="sm" justify="end" mt="lg">
          <Button onClick={onClose} variant="subtle">
            {t`Cancel`}
          </Button>
          <Button
            color={optionValue === "discard" ? "error" : "brand"}
            disabled={isButtonDisabled}
            loading={isProcessing}
            onClick={handleContinueClick}
            variant="filled"
          >
            {getContinueButtonText(optionValue)}
          </Button>
        </Group>
      </Box>
    </Modal>
  );
};

const getContinueButtonText = (optionValue?: OptionValue) => {
  switch (optionValue) {
    case "push":
    case "new-branch":
      return t`Push changes`;
    case "discard":
      return t`Discard changes`;
    default:
      return t`Continue`;
  }
};
