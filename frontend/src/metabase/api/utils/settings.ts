import { useMemo } from "react";

import type { Settings } from "metabase-types/api";

import { useGetSettingsQuery } from "../session";
import {
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
} from "../settings";

/**
 * One hook to get setting values and mutators for a given setting
 */
export const useAdminSetting = <SettingName extends keyof Settings>(
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
    () => settingsDetails?.find(setting => setting.key === settingName),
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
