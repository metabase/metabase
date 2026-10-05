import { useDispatch } from "metabase/redux";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

import { settingsApi } from "./api";
import { useAdminSetting } from "./use-admin-setting";

type BooleanSettingKey = {
  [Key in EnterpriseSettingKey]: EnterpriseSettings[Key] extends
    | boolean
    | null
    | undefined
    ? Key
    : never;
}[EnterpriseSettingKey];

export type SettingSwitchState = {
  checked: boolean;
  envName: string | undefined;
  isBusy: boolean;
  onChange: (enabled: boolean) => Promise<void>;
};

/** A switch that writes its boolean setting at once: the click shows immediately and is undone if the write fails */
export function useSettingSwitch(
  settingKey: BooleanSettingKey,
  { onToggle }: { onToggle?: (enabled: boolean) => void } = {},
): SettingSwitchState {
  const dispatch = useDispatch();
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isFetching,
  } = useAdminSetting(settingKey);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;

  const onChange = async (enabled: boolean) => {
    const patch = dispatch(
      settingsApi.util.updateQueryData(
        "getSessionProperties",
        undefined,
        (draft) => {
          draft[settingKey] = enabled;
        },
      ),
    );
    const { error } = await updateSetting({ key: settingKey, value: enabled });
    if (error) {
      patch.undo();
    } else {
      onToggle?.(enabled);
    }
  };

  return {
    checked: value ?? false,
    envName,
    // a fetch still in flight could answer with the value from before the write
    isBusy: isFetching || updateSettingResult.isLoading,
    onChange,
  };
}
