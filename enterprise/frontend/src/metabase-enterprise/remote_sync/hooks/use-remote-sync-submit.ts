import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useGetSettingsQuery, useSetting } from "metabase/settings";
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
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const { data: settingValues } = useGetSettingsQuery();
  const [
    updateRemoteSyncSettings,
    { isLoading: isUpdating, error: updateError },
  ] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary, { isLoading: isCreatingLibrary }] =
    useCreateLibraryMutation();
  const [sendToast] = useToast();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const saveSettings = useCallback(
    async (values: RemoteSyncSettingsFormState) => {
      const isInitialSetup = !isRemoteSyncEnabled;
      const didBranchChange =
        values[BRANCH_KEY] !== settingValues?.[BRANCH_KEY];
      // Read-only instances take their content from the repository, and the API rejects collection changes for them.
      const syncsContent = values[TYPE_KEY] !== "read-only";

      const collectionsMap: Record<number, boolean> = {
        ...values[COLLECTIONS_KEY],
      };

      if (
        !libraryCollection &&
        syncsContent &&
        values[SYNC_LIBRARY_PENDING_KEY]
      ) {
        try {
          const newLibrary = await createLibrary().unwrap();
          // A freshly created library always has a numeric id; only seeded collections use string ids.
          collectionsMap[newLibrary.id as number] = true;
        } catch (error) {
          sendToast({
            message: t`Failed to create Library`,
            variant: "negative",
          });
          throw error;
        }
      }

      const initialCollections = initialValues[COLLECTIONS_KEY] ?? {};
      const collectionsToSave: Record<number, boolean> = {};
      for (const [idStr, desired] of Object.entries(collectionsMap)) {
        const id = Number(idStr);
        // On first setup the defaults are sent too, so the Library gets marked as synced.
        if (isInitialSetup || initialCollections[id] !== desired) {
          collectionsToSave[id] = desired;
        }
      }
      const hasCollectionsToSave = Object.keys(collectionsToSave).length > 0;

      // Listed key by key so the sync-library-pending form field, which is not a setting, stays out.
      const settingsToSave: RemoteSyncConfigurationSettings = {
        [REMOTE_SYNC_KEY]: values[REMOTE_SYNC_KEY],
        [URL_KEY]: values[URL_KEY],
        [TOKEN_KEY]: values[TOKEN_KEY],
        [TYPE_KEY]: values[TYPE_KEY],
        [BRANCH_KEY]: values[BRANCH_KEY],
        [AUTO_IMPORT_KEY]: values[AUTO_IMPORT_KEY],
        ...(syncsContent ? { [TRANSFORMS_KEY]: values[TRANSFORMS_KEY] } : {}),
        ...(syncsContent && hasCollectionsToSave
          ? { [COLLECTIONS_KEY]: collectionsToSave }
          : {}),
      };

      try {
        await updateRemoteSyncSettings(settingsToSave).unwrap();

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
          variant: "negative",
        });
        throw isRemoteSyncDependencyError(error)
          ? { ...error, data: { ...error.data, errors: undefined } }
          : error;
      }
    },
    [
      isRemoteSyncEnabled,
      settingValues,
      initialValues,
      updateRemoteSyncSettings,
      isModalVariant,
      libraryCollection,
      createLibrary,
      sendToast,
      onSaveSuccess,
    ],
  );

  const handleSubmit = useCallback(
    async (values: RemoteSyncSettingsFormState) => {
      if (!isRemoteSyncEnabled) {
        showConfirmation({
          title: t`Replace this instance's Library and transforms?`,
          message: t`Setting up remote sync will replace this instance's Library and transforms with the contents of the repository. Any Library content or transforms that aren't in the repository will be removed.`,
          confirmButtonText: t`Set up remote sync`,
          confirmButtonProps: {
            variant: "filled",
            color: "negative",
          },
          onConfirm: () => saveSettings(values),
        });
        return;
      }

      if (values[BRANCH_KEY] !== settingValues?.[BRANCH_KEY]) {
        showConfirmation({
          title: t`Switch branches?`,
          message: t`The synced collection will update to match the new branch. Questions that exist in the current branch but not the new one will be removed from any dashboards or content that reference them permanently, even if you switch back.`,
          confirmButtonText: t`Continue`,
          confirmButtonProps: {
            variant: "filled",
            color: "negative",
          },
          onConfirm: () => saveSettings(values),
        });
        return;
      }

      await saveSettings(values);
    },
    [isRemoteSyncEnabled, settingValues, showConfirmation, saveSettings],
  );

  const unsyncedDependenciesError = useMemo(
    () =>
      isRemoteSyncDependencyError(updateError) ? updateError.data : undefined,
    [updateError],
  );

  return {
    handleSubmit,
    confirmationModal,
    isUpdating,
    isCreatingLibrary,
    unsyncedDependenciesError,
  };
};
