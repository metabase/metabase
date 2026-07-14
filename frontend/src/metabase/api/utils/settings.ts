import { useCallback, useMemo } from "react";
import { shallowEqual } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getSetting, getSettings } from "metabase/selectors/settings";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  EnterpriseSettings,
  SettingDefinition,
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
    isLoading: settingsLoading,
    isFetching: settingsFetching,
    ...apiProps
  } = useGetSettingsQuery();
  const {
    data: settingsDetails,
    isLoading: detailsLoading,
    isFetching: detailsFetching,
  } = useGetAdminSettingsDetailsQuery();
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

        sendToast({
          message,
          icon: "warning",
          toastColor: "feedback-negative",
        });
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
          // Unjustified type cast. FIXME
          (response.error as { data?: { message: string } })?.data?.message ||
          t`Error saving settings`;

        sendToast({
          message,
          icon: "warning",
          toastColor: "feedback-negative",
        });
      } else {
        sendToast({ message: t`Changes saved`, icon: "check_filled" });
      }
      return response;
    },
    [updateSettings, sendToast],
  );

  // Read the value through `getSetting` so it resolves from the cache with a
  // synchronous fallback to the bootstrap (available before the fetch resolves),
  // the same as `useSetting`.
  // Unjustified type cast. FIXME
  const settingValue = useSelector((state) =>
    getSetting(state, settingName),
  ) as EnterpriseSettingValue<SettingName>;

  return {
    value: settingValue,
    settingDetails,
    description: settingDetails?.description,
    updateSetting: handleUpdateSetting,
    updateSettings: handleUpdateSettings,
    updateSettingResult,
    updateSettingsResult,
    isLoading: settingsLoading || detailsLoading,
    isFetching: settingsFetching || detailsFetching,
    ...apiProps,
  };
};

/**
 * Hook to get setting values and mutators for multiple settings
 */
export const useAdminSettings = <
  SettingNames extends readonly EnterpriseSettingKey[],
>(
  settingNames: SettingNames,
) => {
  const {
    data: settings,
    isLoading: settingsLoading,
    ...apiProps
  } = useGetSettingsQuery();
  const { data: settingsDetails, isLoading: detailsLoading } =
    useGetAdminSettingsDetailsQuery();
  const [updateSettings, updateSettingsResult] = useUpdateSettingsMutation();

  const [sendToast] = useToast();

  const handleUpdateSettings = useCallback(
    async ({
      toast = true,
      ...settings
    }: { toast?: boolean } & Partial<EnterpriseSettings>) => {
      const response = await updateSettings(settings);

      if (toast) {
        if (response.error) {
          const message =
            // Unjustified type cast. FIXME
            (response.error as { data?: { message: string } })?.data?.message ||
            t`Error saving settings`;

          sendToast({
            message,
            icon: "warning",
            toastColor: "feedback-negative",
          });
        } else {
          sendToast({ message: t`Changes saved`, icon: "check_filled" });
        }
      }

      return response;
    },
    [updateSettings, sendToast],
  );

  type Values = { [K in SettingNames[number]]: EnterpriseSettings[K] };
  // Pick from `getSettings` (cache with bootstrap fallback) rather than raw
  // `useGetSettingsQuery` data, which is an empty bag mid-fetch — making
  // `Object.values({}).every(...)` checks vacuously true.
  const values = useSelector(
    // Unjustified type cast. FIXME
    (state) => _.pick(getSettings(state), ...settingNames) as Values,
    shallowEqual,
  );

  type Details = { [K in SettingNames[number]]: SettingDefinition<K> };
  const details = useMemo(() => {
    // Unjustified type cast. FIXME
    return (
      settingsDetails ? _.pick(settingsDetails, ...settingNames) : {}
    ) as Details;
  }, [settingsDetails, settingNames]);

  return {
    values,
    details,
    updateSettings: handleUpdateSettings,
    updateSettingsResult,
    isLoading: settingsLoading || detailsLoading,
    ...apiProps,
  };
};
