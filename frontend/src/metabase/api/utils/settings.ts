import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
} from "metabase-types/api";

import { useGetSettingsQuery } from "../session";
import {
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
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
        sendToast({ message: t`Changes saved`, icon: "check" });
      }
      return response;
    },
    [updateSetting, sendToast],
  );

  const settingValue = settings?.[settingName];

  return {
    value: settingValue,
    settingDetails,
    description: settingDetails?.description,
    updateSetting: handleUpdateSetting,
    updateSettingResult,
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
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("data" in payload) {
    const data = payload.data;
    if (typeof data === "string") {
      return data;
    }
    if (
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }

  return fallback;
};
