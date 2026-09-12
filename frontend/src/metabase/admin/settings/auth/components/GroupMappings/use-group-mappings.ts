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

// the providers whose mappings live in a plain setting
export type GroupMappingsSettingKey =
  | "jwt-group-mappings"
  | "ldap-group-mappings"
  | "saml-group-mappings";

export type GroupMappingsSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type SaveOptions = {
  successMessage?: string;
  // the row editor shows a failure under its field, everything else toasts it
  showErrorToast?: boolean;
};

export type GroupMappingsState = {
  mappings: MappingsType;
  isSaving: boolean;
  saveMappings: (
    mappings: MappingsType,
    options?: SaveOptions,
  ) => Promise<GroupMappingsSaveResult>;
};

const EMPTY_MAPPINGS: MappingsType = {};

export function useGroupMappings({
  settingKey,
}: {
  settingKey: GroupMappingsSettingKey;
}): GroupMappingsState {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();
  const mappings = useSetting(settingKey) ?? EMPTY_MAPPINGS;
  const [isSaving, setIsSaving] = useState(false);

  const saveMappings = async (
    nextMappings: MappingsType,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
    setIsSaving(true);
    try {
      const response = await updateSettings({ [settingKey]: nextMappings });
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
            draft[settingKey] = nextMappings;
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

  return { mappings, isSaving, saveMappings };
}
