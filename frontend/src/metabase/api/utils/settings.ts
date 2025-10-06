import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  EnterpriseSettings,
} from "metabase-types/api";

import { useGetSettingsQuery } from "../session";
import {
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
} from "../settings";

import { getErrorMessage } from "./errors";

/**
 * One hook to get setting values and mutators for a given setting
 */
export const useAdminSetting = <SettingName extends EnterpriseSettingKey>(
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
  const [updateSettings, updateSettingsResult] = useUpdateSettingsMutation();

  const settingDetails = settingsDetails?.[settingName];

  const [sendToast] = useToast();

  const handleUpdateSetting = useCallback(
    async <K extends EnterpriseSettingKey>({
      key,
      value,
      toast = true,
    }: {
      key: K;
      value: EnterpriseSettingValue<K>;
      toast?: boolean;
    }) => {
      const response = await updateSetting({ key, value });

      if (!toast) {
        return response;
      }

      if (response.error) {
        const message = getErrorMessage(response.error, t`Error saving ${key}`);

        sendToast({ message, icon: "warning", toastColor: "danger" });
      } else {
        sendToast({ message: t`Changes saved` });
      }
      return response;
    },
    [updateSetting, sendToast],
  );

  const handleUpdateSettings = useCallback(
    async ({
      toast = true,
      ...settings
    }: {
      toast?: boolean;
    } & Partial<EnterpriseSettings>) => {
      const response = await updateSettings(settings);

      if (!toast) {
        return response;
      }

      if (response.error) {
        const message =
          (response.error as { data?: { message: string } })?.data?.message ||
          t`Error saving settings`;

        sendToast({ message, icon: "warning", toastColor: "danger" });
      } else {
        sendToast({ message: t`Changes saved`, icon: "check_filled" });
      }
      return response;
    },
    [updateSettings, sendToast],
  );

  const settingValue = settings?.[settingName];

  return {
    value: settingValue,
    settingDetails,
    description: settingDetails?.description,
    updateSetting: handleUpdateSetting,
    updateSettings: handleUpdateSettings,
    updateSettingResult,
    updateSettingsResult,
    isLoading: settingsLoading || detailsLoading,
    ...apiProps,
  };
};
