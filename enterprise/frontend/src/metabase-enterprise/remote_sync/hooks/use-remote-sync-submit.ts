import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useGetSettingsQuery } from "metabase/settings";
import { useCreateLibraryMutation } from "metabase-enterprise/api";
import { useUpdateRemoteSyncSettingsMutation } from "metabase-enterprise/api/remote-sync";
import type {
  LibraryCollection,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";
import { isRemoteSyncDependencyError } from "metabase-types/guards";

import {
  trackBranchSwitched,
  trackRemoteSyncSettingsChanged,
} from "../analytics";
import {
  AUTO_IMPORT_KEY,
  BRANCH_KEY,
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  SYNC_LIBRARY_PENDING_KEY,
  TOKEN_KEY,
  TRANSFORMS_KEY,
  TYPE_KEY,
  URL_KEY,
} from "../constants";
import type {
  RemoteSyncSettingsFormState,
  RemoteSyncSettingsVariant,
} from "../types";

interface UseRemoteSyncSubmitProps {
  initialValues: RemoteSyncSettingsFormState;
  libraryCollection?: LibraryCollection;
  onSaveSuccess?: VoidFunction;
  variant: RemoteSyncSettingsVariant;
}

export const useRemoteSyncSubmit = ({
  initialValues,
  libraryCollection,
  onSaveSuccess,
  variant,
}: UseRemoteSyncSubmitProps) => {
  const isModalVariant = variant === "settings-modal";
  const { data: settingValues } = useGetSettingsQuery();
  const [
    updateRemoteSyncSettings,
    { isLoading: isUpdating, error: updateError },
  ] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary, { isLoading: isCreatingLibrary }] =
    useCreateLibraryMutation();
  const [sendToast] = useToast();
  const {
    show: showBranchChangeConfirmation,
    modalContent: branchChangeModal,
  } = useConfirmation();
  const pendingConfirmationSettingsRef =
    useRef<RemoteSyncConfigurationSettings | null>(null);

  const handleSubmit = useCallback(
    async (values: RemoteSyncSettingsFormState) => {
      const didBranchChange =
        values[BRANCH_KEY] !== settingValues?.[BRANCH_KEY];

      const collectionsMap: Record<number, boolean> = {
        ...values[COLLECTIONS_KEY],
      };

      const wantsSyncLibrary = values[SYNC_LIBRARY_PENDING_KEY];
      if (isModalVariant && !libraryCollection && wantsSyncLibrary) {
        try {
          const newLibrary = await createLibrary().unwrap();
          // A freshly created library always has a numeric id; only seeded collections use string ids.
          collectionsMap[newLibrary.id as number] = true;
        } catch (error) {
          sendToast({
            message: t`Failed to create Library`,
            icon: "warning",
          });
          throw error;
        }
      }

      const initialCollections = initialValues[COLLECTIONS_KEY] ?? {};
      const changedCollections: Record<number, boolean> = {};
      for (const [idStr, desired] of Object.entries(collectionsMap)) {
        const id = Number(idStr);
        if (initialCollections[id] !== desired) {
          changedCollections[id] = desired;
        }
      }
      const hasCollectionChanges = Object.keys(changedCollections).length > 0;

      // Listed key by key so the sync-library-pending form field, which is not a setting, stays out.
      const isReadOnly = values[TYPE_KEY] === "read-only";
      const settingsToSave: RemoteSyncConfigurationSettings = {
        [REMOTE_SYNC_KEY]: values[REMOTE_SYNC_KEY],
        [URL_KEY]: values[URL_KEY],
        [TOKEN_KEY]: values[TOKEN_KEY],
        [TYPE_KEY]: values[TYPE_KEY],
        [BRANCH_KEY]: values[BRANCH_KEY],
        [AUTO_IMPORT_KEY]: values[AUTO_IMPORT_KEY],
        [TRANSFORMS_KEY]: values[TRANSFORMS_KEY],
        ...(isReadOnly || !hasCollectionChanges
          ? {}
          : {
              [COLLECTIONS_KEY]: changedCollections,
            }),
      };

      const saveSettings = async (
        settings: RemoteSyncConfigurationSettings,
      ) => {
        try {
          await updateRemoteSyncSettings(settings).unwrap();

          trackRemoteSyncSettingsChanged({
            triggeredFrom: isModalVariant ? "data-studio" : "admin-settings",
          });

          if (
            didBranchChange &&
            settingValues?.[BRANCH_KEY] &&
            values[BRANCH_KEY]
          ) {
            trackBranchSwitched({
              triggeredFrom: "admin-settings",
            });
          }

          sendToast({ message: t`Settings saved successfully`, icon: "check" });
          onSaveSuccess?.();
        } catch (error) {
          sendToast({
            message: getErrorMessage(error, t`Settings could not be saved`),
            icon: "warning",
          });
          throw isRemoteSyncDependencyError(error)
            ? { ...error, data: { ...error.data, errors: undefined } }
            : error;
        }
      };

      if (didBranchChange) {
        pendingConfirmationSettingsRef.current = settingsToSave;
        showBranchChangeConfirmation({
          title: t`Switch branches?`,
          message: t`The synced collection will update to match the new branch. Questions that exist in the current branch but not the new one will be removed from any dashboards or content that reference them permanently, even if you switch back.`,
          confirmButtonText: t`Continue`,
          confirmButtonProps: {
            variant: "filled",
            color: "feedback-negative",
          },
          onConfirm: async () => {
            if (pendingConfirmationSettingsRef.current) {
              await saveSettings(pendingConfirmationSettingsRef.current);
              pendingConfirmationSettingsRef.current = null;
            }
          },
          onCancel: () => {
            pendingConfirmationSettingsRef.current = null;
          },
        });
        return;
      }
      await saveSettings(settingsToSave);
    },
    [
      settingValues,
      initialValues,
      updateRemoteSyncSettings,
      isModalVariant,
      libraryCollection,
      createLibrary,
      sendToast,
      onSaveSuccess,
      showBranchChangeConfirmation,
    ],
  );

  const unsyncedDependenciesError = useMemo(
    () =>
      isRemoteSyncDependencyError(updateError) ? updateError.data : undefined,
    [updateError],
  );

  return {
    handleSubmit,
    branchChangeModal,
    isUpdating,
    isCreatingLibrary,
    unsyncedDependenciesError,
  };
};
