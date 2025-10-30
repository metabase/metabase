import { match } from "ts-pattern";

import { getCommonEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-common-embed-settings";

import type { SdkIframeEmbedSetupSettings } from "../types";

import { getExperienceFromSettings } from "./get-default-sdk-iframe-embed-setting";

export const getAdjustedSdkIframeEmbedSetting = ({
  defaultSettings,
  prevSettings,
  settings,
}: {
  defaultSettings: SdkIframeEmbedSetupSettings;
  prevSettings: SdkIframeEmbedSetupSettings;
  settings: SdkIframeEmbedSetupSettings;
}): SdkIframeEmbedSetupSettings => {
  const experience = getExperienceFromSettings(settings);

  return match({ prevSettings, settings })
    .with(
      {
        prevSettings: { isStatic: false },
        settings: { isStatic: true },
      },
      ({ settings }) => ({
        ...settings,
        ...getCommonEmbedSettings({
          state: {
            isStatic: settings.isStatic,
            useExistingUserSession: settings.useExistingUserSession,
          },
          experience,
        }),
      }),
    )
    .with(
      {
        prevSettings: { isStatic: true },
        settings: { isStatic: false },
      },
      ({ settings }) => ({
        ...settings,
        drills: "drills" in defaultSettings && defaultSettings.drills,
        isSaveEnabled:
          "isSaveEnabled" in defaultSettings && defaultSettings.isSaveEnabled,
        ...getCommonEmbedSettings({
          state: {
            isStatic: settings.isStatic,
            useExistingUserSession: settings.useExistingUserSession,
          },
          experience,
        }),
        useExistingUserSession: settings.useExistingUserSession,
      }),
    )
    .otherwise(({ settings }) => settings);
};
