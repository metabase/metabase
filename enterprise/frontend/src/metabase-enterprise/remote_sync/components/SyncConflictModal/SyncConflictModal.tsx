import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Icon, Modal, Text } from "metabase/ui";
import { useGetBranchesQuery } from "metabase-enterprise/api";
import { AllChangesView } from "metabase-enterprise/remote_sync/components/ChangesLists/AllChangesView";
import type { RemoteSyncConflictVariant } from "metabase-types/api";

import { ChangesLists } from "../ChangesLists";

import { BranchNameInput } from "./BranchNameInput";
import { OutOfSyncOptions } from "./OutOfSyncOptions";
import {
  useDiscardChangesAndImportAction,
  usePushChangesAction,
  useStashToNewBranchAction,
} from "./mutation-wrappers";
import { type OptionValue, getContinueButtonText } from "./utils";

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
      title={
        variant === "push" ? (
          <>
            {t`Your branch is behind the remote branch.`}{" "}
            {t`What do you want to do?`}
          </>
        ) : (
          t`You have unsynced changes. What do you want to do?`
        )
      }
      padding="xl"
      styles={{ title: { lineHeight: "2rem" } }}
      withCloseButton={false}
    >
      <Box pt="md">
        {variant === "setup" ? (
          <>
            <Text component="p">
              {t`We detected your instance has unsynced items that will be overwritten by pulling changes from the remote branch.`}
            </Text>
            <Text component="p" mb="sm" mt="md">
              {t`What will be lost: `}
            </Text>
            <AllChangesView
              entities={[
                {
                  id: 1,
                  sync_status: "delete",
                  name: "Transform 1",
                  model: "card",
                },
                {
                  id: 2,
                  sync_status: "delete",
                  name: "Transform 2",
                  model: "card",
                },
                {
                  id: 3,
                  sync_status: "delete",
                  name: "Snippet 1",
                  model: "snippet",
                },
                {
                  id: 4,
                  sync_status: "delete",
                  name: "Snippet 2",
                  model: "snippet",
                },
                {
                  id: 5,
                  sync_status: "delete",
                  name: "Published table 1",
                  model: "table",
                },
              ]}
            />
          </>
        ) : (
          <ChangesLists />
        )}

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
