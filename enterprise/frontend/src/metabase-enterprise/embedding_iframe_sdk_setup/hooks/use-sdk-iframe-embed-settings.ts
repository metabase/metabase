import { useCallback, useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { useUserSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import {
  EMBED_FALLBACK_DASHBOARD_ID,
  USER_SETTINGS_DEBOUNCE_MS,
} from "metabase-enterprise/embedding_iframe_sdk_setup/constants";
import type {
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupSettings,
} from "metabase-enterprise/embedding_iframe_sdk_setup/types";

import { trackEmbedWizardOpened } from "../analytics";
import {
  getDefaultSdkIframeEmbedSettings,
  getExperienceFromSettings,
  getResourceIdFromSettings,
} from "../utils/get-default-sdk-iframe-embed-setting";

const getSettingsToPersist = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
) => {
  return _.pick(settings, ["theme", "useExistingUserSession"]);
};

const usePersistedSettings = () => {
  const [rawPersisted, rawPersistSettings] = useUserSetting(
    "sdk-iframe-embed-setup-settings",
    { debounceTimeout: USER_SETTINGS_DEBOUNCE_MS },
  );

  const persistedSettings = useMemo(
    () => getSettingsToPersist(rawPersisted || {}),
    [rawPersisted],
  );

  const persistSettings = useCallback(
    (settings: Partial<SdkIframeEmbedSetupSettings>) => {
      rawPersistSettings(getSettingsToPersist(settings));
    },
    [rawPersistSettings],
  );

  return [persistedSettings, persistSettings] as const;
};

export const useSdkIframeEmbedSettings = ({
  initialState,
  recentDashboards,
  isRecentsLoading,
  modelCount,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  isRecentsLoading: boolean;
  modelCount: number;
}) => {
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);
  const [persistedSettings, persistSettings] = usePersistedSettings();

  const defaultSettings = useMemo(() => {
    return match(initialState)
      .with(
        { resourceType: "dashboard", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            experience: "dashboard",
            resourceId: initialState.resourceId,
          }),
      )
      .with(
        { resourceType: "question", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            experience: "chart",
            resourceId: initialState.resourceId,
          }),
      )
      .otherwise(() =>
        getDefaultSdkIframeEmbedSettings({
          experience: "dashboard",
          resourceId: recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
        }),
      );
  }, [recentDashboards, initialState]);

  const [rawSettings, setRawSettings] = useState<SdkIframeEmbedSetupSettings>();

  const settings = useMemo(() => {
    const latestSettings = rawSettings ?? defaultSettings;

    // Append entity-types=model if there are more than 2 models in the instance.
    if (modelCount > 2) {
      return match(latestSettings)
        .with({ componentName: "metabase-question" }, (settings) => ({
          ...settings,
          entityTypes: ["model" as const],
        }))
        .with({ componentName: "metabase-browser" }, (settings) => ({
          ...settings,
          dataPickerEntityTypes: ["model" as const],
        }))
        .otherwise((settings) => settings);
    }

    return latestSettings;
  }, [defaultSettings, modelCount, rawSettings]);

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSetupSettings>) =>
      setRawSettings((prevSettings) => {
        // Merging with a partial setting requires us to cast the type
        const mergedSettings = {
          ...(prevSettings ?? defaultSettings),
          ...nextSettings,
        } as SdkIframeEmbedSetupSettings;

        persistSettings(mergedSettings);

        return mergedSettings;
      }),
    [defaultSettings, persistSettings],
  );

  const replaceSettings = useCallback(
    (nextSettings: SdkIframeEmbedSetupSettings) => {
      setRawSettings(nextSettings);
      persistSettings(nextSettings);
    },
    [persistSettings],
  );

  // Once the persisted settings are loaded, check if they are valid.
  // If they are, set them as the current settings.
  useEffect(() => {
    if (!isEmbedSettingsLoaded && !isRecentsLoading) {
      setRawSettings({
        ...settings,
        ...persistedSettings,

        // Override the persisted settings if `useExistingUserSession` is specified.
        // This is used for Embedding Hub.
        ...(initialState?.useExistingUserSession !== undefined && {
          useExistingUserSession: initialState.useExistingUserSession,
        }),
      });

      setEmbedSettingsLoaded(true);

      trackEmbedWizardOpened();
    }
  }, [
    persistedSettings,
    isEmbedSettingsLoaded,
    settings,
    isRecentsLoading,
    initialState,
  ]);

  return {
    settings,
    defaultSettings: {
      resourceId: getResourceIdFromSettings(defaultSettings) ?? "",
      experience: getExperienceFromSettings(defaultSettings),
    },
    isEmbedSettingsLoaded,
    replaceSettings,
    updateSettings,
  };
};
