import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { pick } from "underscore";

import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Modal } from "metabase/ui";
import {
  useGetBranchesQuery,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";
import {
  AUTO_IMPORT_KEY,
  BRANCH_KEY,
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  TOKEN_KEY,
  TRANSFORMS_KEY,
  TYPE_KEY,
  URL_KEY,
} from "metabase-enterprise/remote_sync/constants";
import { useLibraryCollection } from "metabase-enterprise/remote_sync/hooks/use-library-collection";
import type {
  RemoteSyncConfigurationSettings,
  RemoteSyncConflictVariant,
} from "metabase-types/api";

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
  const { sendErrorToast } = useMetadataToasts();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const libraryCollection = useLibraryCollection();
  const { data: branchesData } = useGetBranchesQuery();
  const existingBranches = useMemo(
    () => branchesData?.items || [],
    [branchesData],
  );
  const [updateRemoteSyncSettings, { isLoading: isUpdatingSettings }] =
    useUpdateRemoteSyncSettingsMutation();
  const { pushChanges, isPushingChanges } = usePushChangesAction();
  const { stashToNewBranch, isStashing } =
    useStashToNewBranchAction(existingBranches);
  const { discardChangesAndImport, isImporting } =
    useDiscardChangesAndImportAction();

  const markLibraryAndTransformsAsSynced = useCallback(async () => {
    try {
      const currentSettings: RemoteSyncConfigurationSettings = pick(
        settingValues || {},
        [
          REMOTE_SYNC_KEY,
          AUTO_IMPORT_KEY,
          BRANCH_KEY,
          TYPE_KEY,
          COLLECTIONS_KEY,
        ],
      );

      const settingsToUpdate: RemoteSyncConfigurationSettings = {
        ...currentSettings,
        [URL_KEY]: settingDetails?.[URL_KEY]?.value || null,
        [TOKEN_KEY]: settingDetails?.[TOKEN_KEY]?.value || null,
        [TRANSFORMS_KEY]: true,
      };

      if (libraryCollection?.id) {
        settingsToUpdate[COLLECTIONS_KEY] = {
          ...currentSettings[COLLECTIONS_KEY],
          [libraryCollection?.id]: true,
        };
      }

      await updateRemoteSyncSettings(settingsToUpdate).unwrap();
    } catch (error) {
      sendErrorToast(t`Failed to mark library and transforms as synced`);
      throw error;
    }
  }, [
    libraryCollection?.id,
    sendErrorToast,
    settingDetails,
    settingValues,
    updateRemoteSyncSettings,
  ]);

  const handleContinueButtonClick = async () => {
    if (!optionValue) {
      return;
    }

    if (optionValue === "push" || optionValue === "force-push") {
      await pushChanges(currentBranch, optionValue === "force-push", onClose);
    }

    if (optionValue === "new-branch") {
      if (variant === "setup") {
        await markLibraryAndTransformsAsSynced();
      }

      await stashToNewBranch(newBranchName, onClose);
    }

    if (optionValue === "discard") {
      await discardChangesAndImport(nextBranch || currentBranch, onClose);
    }
  };

  const isProcessing =
    isImporting || isPushingChanges || isStashing || isUpdatingSettings;
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
