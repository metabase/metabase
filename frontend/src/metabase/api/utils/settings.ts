import { useMemo } from "react";

import type { EnterpriseSettingKey, SettingKey } from "metabase-types/api";

import { useGetSettingsQuery } from "../session";
import {
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
} from "../settings";

/**
 * One hook to get setting values and mutators for a given setting
 * generic version, should not be used directly
 */
export const _useAdminSetting = <SettingName extends EnterpriseSettingKey>(
  settingName: SettingName,
) => {
  const {
    data: settings,
    isLoading: settingsLoading,
    ...apiProps
  } = useGetSettingsQuery();
  const { data: settingsDetails, isLoading: detailsLoading } =
    useGetAdminSettingsDetailsQuery();
  const [updateSetting, updateSettingResult] = useUpdateSettingMutation();

  const settingDetails = useMemo(
    () => settingsDetails?.find((setting) => setting.key === settingName),
    [settingsDetails, settingName],
  );

  const settingValue = settings?.[settingName];

  return {
    value: settingValue,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading: settingsLoading || detailsLoading,
    ...apiProps,
  };
};

/**
 * One hook to get setting values and mutators for a given OSS setting
 */
export const useAdminSetting = _useAdminSetting<SettingKey>;
