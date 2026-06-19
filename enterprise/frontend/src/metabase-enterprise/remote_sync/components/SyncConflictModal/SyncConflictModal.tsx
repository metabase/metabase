import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetSettingsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useSelector } from "metabase/redux";
import { Box, Button, Group, Icon, Modal } from "metabase/ui";
import {
  useGetBranchesQuery,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";
import { useGetLibraryCollection } from "metabase-enterprise/data-studio/library/utils";
import {
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  TRANSFORMS_KEY,
} from "metabase-enterprise/remote_sync/constants";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  ForcePushCasualties,
  RemoteSyncConfigurationSettings,
  RemoteSyncConflictVariant,
} from "metabase-types/api";

import { ChangesLists } from "../ChangesLists";
import { CommitMessageSection } from "../PushChangesModal/CommitMessageSection";

import { BranchNameInput } from "./BranchNameInput";
import { ConflictingChangesList } from "./ConflictingChangesList";
import { ForcePushWarning } from "./ForcePushWarning";
import { OutOfSyncOptions } from "./OutOfSyncOptions";
import { SetupConflictInfo } from "./SetupConflictInfo";
import {
  useDiscardChangesAndImportAction,
  useMergeChangesAction,
  useMergeImportAction,
  usePushChangesAction,
  useStashToNewBranchAction,
} from "./hooks";
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
  /** Push variant only: whether a 3-way merge would apply cleanly (offers the Merge option). */
  canMerge?: boolean;
  /** Push variant only: labels of entities that conflict (shown when the merge isn't clean). */
  conflicts?: string[];
  /** Remote content a force push would discard; surfaced when the force-push option is selected. */
  forcePushCasualties?: ForcePushCasualties;
  /** Whether the remote history was rewritten (no merge base); adds context to the force-push warning. */
  historyRewritten?: boolean;
}

export const SyncConflictModal = (props: UnsyncedWarningModalProps) => {
  const {
    onClose,
    currentBranch,
    nextBranch,
    variant,
    canMerge,
    conflicts,
    forcePushCasualties,
    historyRewritten,
  } = props;
  const [optionValue, setOptionValue] = useState<OptionValue>();
  const [newBranchName, setNewBranchName] = useState<string>("");
  // The push variant collects a commit message here, since merge/force/new-branch all push.
  const [commitMessage, setCommitMessage] = useState<string>("");
  const { sendErrorToast } = useMetadataToasts();
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { data: settingValues } = useGetSettingsQuery();
  const { data: libraryCollection } = useGetLibraryCollection({
    skip: !isRemoteSyncEnabled,
  });
  const { data: branchesData } = useGetBranchesQuery();
  const existingBranches = useMemo(
    () => branchesData?.items || [],
    [branchesData],
  );
  const [updateRemoteSyncSettings, { isLoading: isUpdatingSettings }] =
    useUpdateRemoteSyncSettingsMutation();
  const { pushChanges, isPushingChanges } = usePushChangesAction();
  const { mergeChanges, isMerging } = useMergeChangesAction();
  const { mergeImport, isMergingImport } = useMergeImportAction();
  const { stashToNewBranch, isStashing } =
    useStashToNewBranchAction(existingBranches);
  const { discardChangesAndImport, isImporting } =
    useDiscardChangesAndImportAction();

  const markLibraryAndTransformsAsSynced = useCallback(async () => {
    try {
      const remoteSyncSettings: RemoteSyncConfigurationSettings = {
        [COLLECTIONS_KEY]: (settingValues as RemoteSyncConfigurationSettings)[
          COLLECTIONS_KEY
        ],
        [TRANSFORMS_KEY]: true,
      };

      if (libraryCollection?.id) {
        remoteSyncSettings[COLLECTIONS_KEY] = {
          ...remoteSyncSettings[COLLECTIONS_KEY],
          [libraryCollection.id]: !!libraryCollection?.id,
        };
      }

      await updateRemoteSyncSettings(remoteSyncSettings).unwrap();
    } catch (error) {
      sendErrorToast(t`Failed to mark library and transforms as synced`);
      throw error;
    }
  }, [
    libraryCollection?.id,
    sendErrorToast,
    settingValues,
    updateRemoteSyncSettings,
  ]);

  const message = commitMessage.trim() || undefined;

  const handleContinueButtonClick = async () => {
    if (!optionValue) {
      return;
    }

    if (optionValue === "push" || optionValue === "force-push") {
      await pushChanges(
        currentBranch,
        optionValue === "force-push",
        onClose,
        message,
      );
    }

    if (optionValue === "merge") {
      // Pull merges into local only; push merges and pushes the result.
      if (variant === "pull") {
        await mergeImport(currentBranch, onClose);
      } else {
        await mergeChanges(currentBranch, onClose, message);
      }
    }

    if (optionValue === "new-branch") {
      if (variant === "setup") {
        await markLibraryAndTransformsAsSynced();
      }

      await stashToNewBranch(newBranchName, onClose, message);
    }

    if (optionValue === "discard") {
      // nextBranch is set on a switch-branch discard; currentBranch is the branch we're on now and is
      // asserted against the setting to catch a stale tab.
      await discardChangesAndImport(
        nextBranch || currentBranch,
        currentBranch,
        onClose,
      );
    }
  };

  const isProcessing =
    isImporting ||
    isPushingChanges ||
    isMerging ||
    isMergingImport ||
    isStashing ||
    isUpdatingSettings;
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
      title={getModalTitle(variant, canMerge)}
      withCloseButton={false}
    >
      <Box pt="md">
        {variant === "setup" ? (
          <SetupConflictInfo />
        ) : conflicts && conflicts.length > 0 ? (
          <ConflictingChangesList conflicts={conflicts} />
        ) : (
          <ChangesLists />
        )}

        <OutOfSyncOptions
          currentBranch={currentBranch}
          handleOptionChange={setOptionValue}
          isRemoteSyncReadOnly={isRemoteSyncReadOnly}
          optionValue={optionValue}
          variant={variant}
          canMerge={canMerge}
        />

        {optionValue === "force-push" && forcePushCasualties && (
          <ForcePushWarning
            casualties={forcePushCasualties}
            branch={currentBranch}
            historyRewritten={historyRewritten}
          />
        )}

        {optionValue === "new-branch" && (
          <BranchNameInput
            existingBranches={existingBranches}
            setValue={setNewBranchName}
            value={newBranchName}
          />
        )}

        {/* Pushing (merge / force / new branch) needs a commit message; pull/switch/setup don't. */}
        {variant === "push" && optionValue && optionValue !== "discard" && (
          <Box mt="lg">
            <CommitMessageSection
              value={commitMessage}
              onChange={setCommitMessage}
            />
          </Box>
        )}

        <Group gap="sm" justify="end" mt="lg">
          <Button onClick={onClose} variant="subtle">
            {t`Cancel`}
          </Button>
          <Button
            color={optionValue === "discard" ? "error" : "core-brand"}
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
