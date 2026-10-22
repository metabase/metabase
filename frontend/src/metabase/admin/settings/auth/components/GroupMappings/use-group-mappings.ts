import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  settingsApi,
  useSetting,
  useUpdateSettingsMutation,
} from "metabase/settings";
import type { GroupMappings } from "metabase-types/api";

import { EMPTY_MAPPINGS } from "./utils";

export type GroupMappingsSettingKey =
  | "ldap-group-mappings"
  | "saml-group-mappings";

export type GroupMappingsSaveResult =
  | { ok: true }
  | { ok: false; error: string };

export type SaveOptions = {
  successMessage?: string;
  showErrorToast?: boolean;
};

export type SaveMappings = (
  mappings: GroupMappings,
  options?: SaveOptions,
) => Promise<GroupMappingsSaveResult>;

export type GroupMappingsSetting = {
  mappings: GroupMappings;
  saveMappings: SaveMappings;
};

export function useGroupMappings({
  settingKey,
}: {
  settingKey: GroupMappingsSettingKey;
}): GroupMappingsSetting {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();
  const mappings = useSetting(settingKey) ?? EMPTY_MAPPINGS;

  const saveMappings = async (
    nextMappings: GroupMappings,
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
          variant: "negative",
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
