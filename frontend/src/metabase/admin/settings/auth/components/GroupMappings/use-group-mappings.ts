import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  settingsApi,
  useSetting,
  useUpdateSettingsMutation,
} from "metabase/settings";

import type { MappingsType } from "./types";
import { EMPTY_MAPPINGS } from "./utils";

export type GroupMappingsSettingKey =
  | "ldap-group-mappings"
  | "saml-group-mappings";

export type GroupMappingsSaveResult =
  | { ok: true }
  | { ok: false; error: string };

export type SaveOptions = {
  successMessage?: string;
  // the row editor shows a failure under its field, everything else toasts it
  showErrorToast?: boolean;
};

export type GroupMappingsState = {
  mappings: MappingsType;
  saveMappings: (
    mappings: MappingsType,
    options?: SaveOptions,
  ) => Promise<GroupMappingsSaveResult>;
};

export function useGroupMappings({
  settingKey,
}: {
  settingKey: GroupMappingsSettingKey;
}): GroupMappingsState {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();
  const mappings = useSetting(settingKey) ?? EMPTY_MAPPINGS;

  const saveMappings = async (
    nextMappings: MappingsType,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
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
  };

  return { mappings, saveMappings };
}
