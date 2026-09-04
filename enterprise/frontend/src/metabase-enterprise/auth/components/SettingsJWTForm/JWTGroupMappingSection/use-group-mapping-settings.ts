import { useState } from "react";
import { t } from "ttag";

import type { MappingsType } from "metabase/admin/types";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  settingsApi,
  useSetting,
  useUpdateSettingsMutation,
} from "metabase/settings";
import type { EnterpriseSettings } from "metabase-types/api";

export type GroupMappingSettings = Partial<
  Pick<EnterpriseSettings, "jwt-group-sync" | "jwt-group-mappings">
>;

const EMPTY_MAPPINGS: MappingsType = {};

export function useGroupMappingSettings() {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();
  const syncEnabled = useSetting("jwt-group-sync") ?? false;
  const mappings = useSetting("jwt-group-mappings") ?? EMPTY_MAPPINGS;
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async (
    settings: GroupMappingSettings,
    { successMessage }: { successMessage?: string } = {},
  ) => {
    setIsSaving(true);
    try {
      const response = await updateSettings(settings);
      if (response.error) {
        sendToast({
          message: getErrorMessage(
            response.error,
            t`Error saving group mapping`,
          ),
          icon: "warning",
          toastColor: "feedback-negative",
        });
        return false;
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
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  return { syncEnabled, mappings, isSaving, saveSettings };
}

export type GroupMappingSettingsState = ReturnType<
  typeof useGroupMappingSettings
>;
