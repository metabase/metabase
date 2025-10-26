import { match } from "ts-pattern";

import {
  GET_DISABLE_STATIC_EMBEDDING_SETTINGS,
  GET_ENABLE_STATIC_EMBEDDING_SETTINGS,
} from "metabase-enterprise/embedding_iframe_sdk_setup/constants";

import type { SdkIframeEmbedSetupSettings } from "../types";

export const getAdjustedSdkIframeEmbedSetting = ({
  defaultSettings,
  prevSettings,
  settings,
}: {
  defaultSettings: SdkIframeEmbedSetupSettings;
  prevSettings: SdkIframeEmbedSetupSettings;
  settings: SdkIframeEmbedSetupSettings;
}): SdkIframeEmbedSetupSettings => {
  return match({ prevSettings, settings })
    .with(
      {
        prevSettings: { isStatic: false },
        settings: { isStatic: true },
      },
      ({ settings }) => ({
        ...settings,
        ...GET_ENABLE_STATIC_EMBEDDING_SETTINGS(),
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
        ...GET_DISABLE_STATIC_EMBEDDING_SETTINGS(),
        useExistingUserSession: settings.useExistingUserSession,
      }),
    )
    .otherwise(({ settings }) => settings);
};
