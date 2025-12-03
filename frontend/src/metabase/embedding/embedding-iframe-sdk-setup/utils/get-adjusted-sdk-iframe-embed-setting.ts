import { match } from "ts-pattern";

import { getCommonEmbedSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-common-embed-settings";

import type { SdkIframeEmbedSetupSettings } from "../types";

import { getExperienceFromSettings } from "./get-default-sdk-iframe-embed-setting";

export const getAdjustedSdkIframeEmbedSetting = ({
  defaultSettings,
  prevSettings,
  settings,
  isGuestEmbedsEnabled,
}: {
  defaultSettings: SdkIframeEmbedSetupSettings;
  prevSettings: SdkIframeEmbedSetupSettings;
  settings: SdkIframeEmbedSetupSettings;
  isGuestEmbedsEnabled: boolean;
}): SdkIframeEmbedSetupSettings => {
  const experience = getExperienceFromSettings(settings);

  return match({ prevSettings, settings })
    .with(
      {
        prevSettings: { isGuest: false },
        settings: { isGuest: true },
      },
      ({ settings }) => ({
        ...settings,
        ...getCommonEmbedSettings({
          state: {
            isGuest: settings.isGuest,
            useExistingUserSession: settings.useExistingUserSession,
          },
          experience,
          isGuestEmbedsEnabled,
        }),
      }),
    )
    .with(
      {
        prevSettings: { isGuest: true },
        settings: { isGuest: false },
      },
      ({ settings }) => ({
        ...settings,
        drills: "drills" in defaultSettings && defaultSettings.drills,
        isSaveEnabled:
          "isSaveEnabled" in defaultSettings && defaultSettings.isSaveEnabled,
        ...getCommonEmbedSettings({
          state: {
            isGuest: settings.isGuest,
            useExistingUserSession: settings.useExistingUserSession,
          },
          experience,
          isGuestEmbedsEnabled,
        }),
        useExistingUserSession: settings.useExistingUserSession,
      }),
    )
    .otherwise(({ settings }) => settings);
};
