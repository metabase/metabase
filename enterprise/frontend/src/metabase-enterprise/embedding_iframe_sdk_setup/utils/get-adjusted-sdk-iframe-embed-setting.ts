import { match } from "ts-pattern";

import {
  DISABLE_STATIC_EMBEDDING_SETTINGS,
  ENABLE_STATIC_EMBEDDING_SETTINGS,
} from "metabase-enterprise/embedding_iframe_sdk_setup/constants";

import type { SdkIframeEmbedSetupSettings } from "../types";

export const getAdjustedSdkIframeEmbedSetting = ({
  prevSettings,
  settings,
}: {
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
        ...ENABLE_STATIC_EMBEDDING_SETTINGS,
      }),
    )
    .with(
      {
        prevSettings: { isStatic: true },
        settings: { isStatic: false },
      },
      ({ settings }) => ({
        ...settings,
        ...DISABLE_STATIC_EMBEDDING_SETTINGS,
        useExistingUserSession: settings.useExistingUserSession,
      }),
    )
    .otherwise(({ settings }) => settings);
};
