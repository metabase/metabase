import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Icon, Modal, Text } from "metabase/ui";
import { useGetBranchesQuery } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import { ChangesLists } from "../ChangesLists";

import { BranchNameInput } from "./BranchNameInput";
import { OutOfSyncOptions } from "./OutOfSyncOptions";
import {
  useDiscardChangesAndImportAction,
  usePushChangesAction,
  useStashToNewBranchAction,
} from "./mutation-wrappers";
import {
  type OptionValue,
  type SyncConflictVariant,
  getContinueButtonText,
} from "./utils";

export { SyncConflictVariant };

interface UnsyncedWarningModalProps {
  collections: Collection[];
  currentBranch: string;
  nextBranch?: string | null;
  onClose: VoidFunction;
  variant: SyncConflictVariant;
}

export const SyncConflictModal = (props: UnsyncedWarningModalProps) => {
  const { collections, onClose, currentBranch, nextBranch, variant } = props;
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
    useDiscardChangesAndImportAction(collections);
  const isForcingPush = variant === "push" && optionValue === "push";

  const handleContinueButtonClick = async () => {
    if (!optionValue) {
      return;
    }

    if (optionValue === "push") {
      await pushChanges(currentBranch, variant === "push", onClose);
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
      title={
        <Text component="span" fz="1.25rem" lh="2rem">
          {variant === "push" ? (
            <>
              {t`Your branch is behind the remote branch.`}{" "}
              {t`What do you want to do?`}
            </>
          ) : (
            t`You have unsynced changes. What do you want to do?`
          )}
        </Text>
      }
      withCloseButton={false}
    >
      <Box pt="md">
        <ChangesLists collections={collections} />

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
            leftSection={isForcingPush ? <Icon name="warning" /> : undefined}
            loading={isProcessing}
            onClick={handleContinueButtonClick}
            variant="filled"
            title={
              isForcingPush
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
