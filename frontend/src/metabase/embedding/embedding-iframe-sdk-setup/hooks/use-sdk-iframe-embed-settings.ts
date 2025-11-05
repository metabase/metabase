import { useCallback, useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { useUserSetting } from "metabase/common/hooks";
import {
  EMBED_FALLBACK_DASHBOARD_ID,
  USER_SETTINGS_DEBOUNCE_MS,
} from "metabase/embedding/embedding-iframe-sdk-setup/constants";
import type {
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";

import { getAdjustedSdkIframeEmbedSetting } from "../utils/get-adjusted-sdk-iframe-embed-setting";
import {
  getDefaultSdkIframeEmbedSettings,
  getExperienceFromSettings,
  getResourceIdFromSettings,
} from "../utils/get-default-sdk-iframe-embed-setting";

const getSettingsToPersist = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
) => {
  return _.pick(settings, ["theme"]);
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
  isStaticEmbeddingEnabled,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  isRecentsLoading: boolean;
  modelCount: number;
  isStaticEmbeddingEnabled: boolean;
}) => {
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);
  const [persistedSettings, persistSettings] = usePersistedSettings();

  const defaultSettings = useMemo(() => {
    return match(initialState)
      .with(
        { resourceType: "dashboard", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            initialState,
            experience: "dashboard",
            resourceId: initialState.resourceId,
            isStaticEmbeddingEnabled,
          }),
      )
      .with(
        { resourceType: "question", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            initialState,
            experience: "chart",
            resourceId: initialState.resourceId,
            isStaticEmbeddingEnabled,
          }),
      )
      .otherwise((initialState) =>
        getDefaultSdkIframeEmbedSettings({
          initialState,
          experience: "dashboard",
          resourceId: recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
          isStaticEmbeddingEnabled,
        }),
      );
  }, [recentDashboards, initialState, isStaticEmbeddingEnabled]);

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

        const adjustedSettings = getAdjustedSdkIframeEmbedSetting({
          defaultSettings: defaultSettings,
          prevSettings: prevSettings ?? defaultSettings,
          settings: mergedSettings,
          isStaticEmbeddingEnabled,
        });

        persistSettings(adjustedSettings);

        return adjustedSettings;
      }),
    [defaultSettings, persistSettings, isStaticEmbeddingEnabled],
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
      setRawSettings((prevSettings) => {
        const mergedSettings = {
          ...settings,
          ...persistedSettings,
        };

        const adjustedSettings = getAdjustedSdkIframeEmbedSetting({
          defaultSettings,
          prevSettings: prevSettings ?? defaultSettings,
          settings: mergedSettings,
          isStaticEmbeddingEnabled,
        });

        return adjustedSettings;
      });

      setEmbedSettingsLoaded(true);
    }
  }, [
    persistedSettings,
    isEmbedSettingsLoaded,
    settings,
    isRecentsLoading,
    initialState,
    defaultSettings,
    isStaticEmbeddingEnabled,
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
