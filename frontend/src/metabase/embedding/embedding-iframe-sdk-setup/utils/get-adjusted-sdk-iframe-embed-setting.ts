import { match } from "ts-pattern";

import { getCommonEmbedSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-common-embed-settings";

import type { SdkIframeEmbedSetupSettings } from "../types";

import { getExperienceFromSettings } from "./get-default-sdk-iframe-embed-setting";

export const getAdjustedSdkIframeEmbedSetting = ({
  defaultSettings,
  prevSettings,
  settings,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
}: {
  defaultSettings: SdkIframeEmbedSetupSettings;
  prevSettings: SdkIframeEmbedSetupSettings;
  settings: SdkIframeEmbedSetupSettings;
  isGuestEmbedsEnabled: boolean;
  isSsoEnabledAndConfigured: boolean;
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
          experience,
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
          isGuest: settings.isGuest,
          useExistingUserSession: !!settings.useExistingUserSession,
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
        // Skip when the experience defaults don't define the key — otherwise
        // we'd stamp a stray `false` onto settings for experiences that don't
        // support it (e.g. dashboard has no `isSaveEnabled`), which would
        // leak into Snowplow analytics for those resources.
        ...("drills" in defaultSettings && { drills: defaultSettings.drills }),
        ...("isSaveEnabled" in defaultSettings && {
          isSaveEnabled: defaultSettings.isSaveEnabled,
        }),
        ...getCommonEmbedSettings({
          experience,
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
          isGuest: settings.isGuest,
          useExistingUserSession: !!settings.useExistingUserSession,
        }),
      }),
    )
    .otherwise(({ settings }) => settings);
};
