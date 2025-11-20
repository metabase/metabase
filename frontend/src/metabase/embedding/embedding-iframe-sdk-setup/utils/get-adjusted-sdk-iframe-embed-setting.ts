import { match } from "ts-pattern";

import { getCommonEmbedSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-common-embed-settings";

import type { SdkIframeEmbedSetupSettings } from "../types";

import { getExperienceFromSettings } from "./get-default-sdk-iframe-embed-setting";

export const getAdjustedSdkIframeEmbedSetting = ({
  defaultSettings,
  prevSettings,
  settings,
  isStaticEmbeddingEnabled,
}: {
  defaultSettings: SdkIframeEmbedSetupSettings;
  prevSettings: SdkIframeEmbedSetupSettings;
  settings: SdkIframeEmbedSetupSettings;
  isStaticEmbeddingEnabled: boolean;
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
          isStaticEmbeddingEnabled,
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
          isStaticEmbeddingEnabled,
        }),
        useExistingUserSession: settings.useExistingUserSession,
      }),
    )
    .otherwise(({ settings }) => settings);
};
