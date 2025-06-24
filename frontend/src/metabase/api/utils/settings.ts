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

export const getErrorMessage = (
  payload:
    | unknown
    | string
    | { data: { message: string } | string }
    | { message: string },
  fallback: string = t`Something went wrong`,
): string => {
  if (typeof payload === "string") {
    return payload || fallback;
  }

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload) {
    return getErrorMessage(payload.message, fallback);
  }

  if ("data" in payload) {
    return getErrorMessage(payload.data, fallback);
  }

  return fallback;
};
