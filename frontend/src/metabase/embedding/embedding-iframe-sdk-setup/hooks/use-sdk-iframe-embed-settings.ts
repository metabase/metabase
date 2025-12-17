import { useCallback, useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { useSetting, useUserSetting } from "metabase/common/hooks";
import { USER_SETTINGS_DEBOUNCE_MS } from "metabase/embedding/embedding-iframe-sdk-setup/constants";
import type {
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { determineDashboardId } from "metabase/embedding/embedding-iframe-sdk-setup/utils/determine-dashboard-id";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";

import { getAdjustedSdkIframeEmbedSetting } from "../utils/get-adjusted-sdk-iframe-embed-setting";
import {
  getDefaultSdkIframeEmbedSettings,
  getExperienceFromSettings,
  getResourceIdFromSettings,
} from "../utils/get-default-sdk-iframe-embed-setting";

const getSettingsToPersist = ({
  isSimpleEmbedFeatureAvailable,
  settings,
}: {
  isSimpleEmbedFeatureAvailable: boolean;
  settings: Partial<SdkIframeEmbedSetupSettings>;
}): Partial<Pick<SdkIframeEmbedSetupSettings, "theme">> => {
  const keys = [];

  // We don't allow theme change when `simple embedding` feature is not available.
  if (isSimpleEmbedFeatureAvailable) {
    keys.push("theme");
  }

  return _.pick(settings, keys);
};

const usePersistedSettings = ({
  isSimpleEmbedFeatureAvailable,
}: {
  isSimpleEmbedFeatureAvailable: boolean;
}) => {
  const [rawPersisted, rawPersistSettings] = useUserSetting(
    "sdk-iframe-embed-setup-settings",
    { debounceTimeout: USER_SETTINGS_DEBOUNCE_MS },
  );

  const persistedSettings = useMemo(
    () =>
      getSettingsToPersist({
        isSimpleEmbedFeatureAvailable,
        settings: rawPersisted || {},
      }),
    [isSimpleEmbedFeatureAvailable, rawPersisted],
  );

  const persistSettings = useCallback(
    (settings: Partial<SdkIframeEmbedSetupSettings>) => {
      rawPersistSettings(
        getSettingsToPersist({ isSimpleEmbedFeatureAvailable, settings }),
      );
    },
    [isSimpleEmbedFeatureAvailable, rawPersistSettings],
  );

  return [persistedSettings, persistSettings] as const;
};

export const useSdkIframeEmbedSettings = ({
  initialState,
  recentDashboards,
  isRecentsLoading,
  modelCount,
  isSimpleEmbedFeatureAvailable,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  isRecentsLoading: boolean;
  modelCount: number;
  isSimpleEmbedFeatureAvailable: boolean;
  isGuestEmbedsEnabled: boolean;
  isSsoEnabledAndConfigured: boolean;
}) => {
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);
  const [persistedSettings, persistSettings] = usePersistedSettings({
    isSimpleEmbedFeatureAvailable,
  });

  const exampleDashboardId = useSetting("example-dashboard-id");

  const defaultSettings = useMemo(() => {
    return match(initialState)
      .with(
        { resourceType: "dashboard", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            experience: "dashboard",
            resourceId: initialState.resourceId,
            isSimpleEmbedFeatureAvailable,
            isGuestEmbedsEnabled,
            isSsoEnabledAndConfigured,
            isGuest: !!initialState.isGuest,
            useExistingUserSession: !!initialState.useExistingUserSession,
          }),
      )
      .with(
        { resourceType: "question", resourceId: P.nonNullable },
        (initialState) =>
          getDefaultSdkIframeEmbedSettings({
            experience: "chart",
            resourceId: initialState.resourceId,
            isSimpleEmbedFeatureAvailable,
            isGuestEmbedsEnabled,
            isSsoEnabledAndConfigured,
            isGuest: !!initialState.isGuest,
            useExistingUserSession: !!initialState.useExistingUserSession,
          }),
      )
      .otherwise((initialState) =>
        getDefaultSdkIframeEmbedSettings({
          experience: "dashboard",
          resourceId: determineDashboardId({
            isRecentsLoading,
            recentDashboards,
            exampleDashboardId,
          }),
          isSimpleEmbedFeatureAvailable,
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
          isGuest: !!initialState?.isGuest,
          useExistingUserSession: !!initialState?.useExistingUserSession,
        }),
      );
  }, [
    initialState,
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isSsoEnabledAndConfigured,
    exampleDashboardId,
    recentDashboards,
    isRecentsLoading,
  ]);

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
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
        });

        persistSettings(adjustedSettings);

        return adjustedSettings;
      }),
    [
      defaultSettings,
      isGuestEmbedsEnabled,
      isSsoEnabledAndConfigured,
      persistSettings,
    ],
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
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
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
    isGuestEmbedsEnabled,
    isSsoEnabledAndConfigured,
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
