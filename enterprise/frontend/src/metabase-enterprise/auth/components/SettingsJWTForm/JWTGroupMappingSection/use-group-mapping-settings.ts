import { useState } from "react";
import { t } from "ttag";

import type {
  GroupMappingsSaveResult,
  MappingsType,
  SaveOptions,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  settingsApi,
  useGetSettingsQuery,
  useSetting,
  useUpdateSettingsMutation,
} from "metabase/settings";
import type { EnterpriseSettings } from "metabase-types/api";

export type GroupMappingSettings = Partial<
  Pick<EnterpriseSettings, "jwt-group-sync" | "jwt-group-mappings">
>;

export type GroupMappingSettingsState = {
  syncEnabled: boolean;
  mappings: MappingsType;
  isSaving: boolean;
  isAdminSettingsFetching: boolean;
  saveSettings: (
    settings: GroupMappingSettings,
    options?: SaveOptions,
  ) => Promise<GroupMappingsSaveResult>;
};

const EMPTY_MAPPINGS: MappingsType = {};

export function useGroupMappingSettings(): GroupMappingSettingsState {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();
  const syncEnabled = useSetting("jwt-group-sync") ?? false;
  const mappings = useSetting("jwt-group-mappings") ?? EMPTY_MAPPINGS;
  const { isFetching: isAdminSettingsFetching } = useGetSettingsQuery();
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async (
    settings: GroupMappingSettings,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
    setIsSaving(true);
    try {
      const response = await updateSettings(settings);
      if (response.error) {
        const error = getErrorMessage(
          response.error,
          t`Error saving group mapping`,
        );
        if (showErrorToast) {
          sendToast({
            message: error,
            icon: "warning",
            toastColor: "feedback-negative",
          });
        }
        return { ok: false, error };
      }
      // show the saved state right away instead of waiting for the settings refetch
      dispatch(
        settingsApi.util.updateQueryData(
          "getSessionProperties",
          undefined,
          (draft) => {
            Object.assign(draft, settings);
          },
        ),
      );
      if (successMessage != null) {
        sendToast({ message: successMessage, icon: "check_filled" });
      }
      return { ok: true };
    } finally {
      setIsSaving(false);
    }
  };

  return {
    syncEnabled,
    mappings,
    isSaving,
    isAdminSettingsFetching,
    saveSettings,
  };
}
