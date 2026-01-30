import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Icon, Modal } from "metabase/ui";
import { useGetBranchesQuery } from "metabase-enterprise/api";
import type { RemoteSyncConflictVariant } from "metabase-types/api";

import { ChangesLists } from "../ChangesLists";

import { BranchNameInput } from "./BranchNameInput";
import { OutOfSyncOptions } from "./OutOfSyncOptions";
import { SetupConflictInfo } from "./SetupConflictInfo";
import {
  useDiscardChangesAndImportAction,
  usePushChangesAction,
  useStashToNewBranchAction,
} from "./mutation-wrappers";
import {
  type OptionValue,
  getContinueButtonText,
  getModalTitle,
} from "./utils";

interface UnsyncedWarningModalProps {
  currentBranch: string;
  nextBranch?: string | null;
  onClose: VoidFunction;
  variant: RemoteSyncConflictVariant;
}

export const SyncConflictModal = (props: UnsyncedWarningModalProps) => {
  const { onClose, currentBranch, nextBranch, variant } = props;
  const [optionValue, setOptionValue] = useState<OptionValue>();
  const [newBranchName, setNewBranchName] = useState<string>("");
  const { data: branchesData } = useGetBranchesQuery();
  const existingBranches = useMemo(
    () => branchesData?.items || [],
    [branchesData],
  );
  const { pushChanges, isPushingChanges } = usePushChangesAction();
  const { stashToNewBranch, isStashing } =
    useStashToNewBranchAction(existingBranches);
  const { discardChangesAndImport, isImporting } =
    useDiscardChangesAndImportAction();

  const handleContinueButtonClick = async () => {
    if (!optionValue) {
      return;
    }

    if (optionValue === "push" || optionValue === "force-push") {
      await pushChanges(currentBranch, optionValue === "force-push", onClose);
    }

    if (optionValue === "new-branch") {
      await stashToNewBranch(newBranchName, onClose);
    }

    if (optionValue === "discard") {
      await discardChangesAndImport(nextBranch || currentBranch, onClose);
    }
  };

  const isProcessing = isImporting || isPushingChanges || isStashing;
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
      padding="xl"
      styles={{ title: { lineHeight: "2rem" } }}
      title={getModalTitle(variant)}
      withCloseButton={false}
    >
      <Box pt="md">
        {variant === "setup" ? <SetupConflictInfo /> : <ChangesLists />}

        <OutOfSyncOptions
          currentBranch={currentBranch}
          handleOptionChange={setOptionValue}
          optionValue={optionValue}
          variant={variant}
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
            leftSection={
              optionValue === "force-push" ? <Icon name="warning" /> : undefined
            }
            loading={isProcessing}
            onClick={handleContinueButtonClick}
            variant="filled"
            title={
              optionValue === "force-push"
                ? t`Force push will replace the remote version with your changes`
                : undefined
            }
          >
            {getContinueButtonText(optionValue)}
          </Button>
        </Group>
      </Box>
    </Modal>
  );
};
