import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-use";
import { match } from "ts-pattern";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import { useUserSetting } from "metabase/common/hooks";

import { trackEmbedWizardOpened } from "../analytics";
import {
  EMBED_FALLBACK_DASHBOARD_ID,
  USER_SETTINGS_DEBOUNCE_MS,
} from "../constants";
import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import { useParameterList, useRecentItems } from "../hooks";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStep,
} from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const location = useLocation();
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);

  const [rawSettings, setRawSettings] = useState<SdkIframeEmbedSetupSettings>();

  const [persistedSettings, persistSettings] = usePersistedSettings();

  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const {
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isRecentsLoading,
  } = useRecentItems();

  const { data: searchData } = useSearchQuery({
    limit: 0,
    models: ["dataset"],
  });

  const modelCount = searchData?.total ?? 0;

  // Embedding Hub: pre-specifies the auth method to use
  const authMethodOverride = useMemo(() => {
    return new URLSearchParams(location.search).get("auth_method");
  }, [location.search]);

  const defaultSettings = useMemo(() => {
    return getDefaultSdkIframeEmbedSettings(
      "dashboard",
      recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
    );
  }, [recentDashboards]);

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

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

  // Which embed experience are we setting up?
  const experience = useMemo(
    () =>
      match<SdkIframeEmbedSetupSettings, SdkIframeEmbedSetupExperience>(
        settings,
      )
        .with({ template: "exploration" }, () => "exploration")
        .with({ componentName: "metabase-question" }, () => "chart")
        .with({ componentName: "metabase-browser" }, () => "browser")
        .with({ componentName: "metabase-dashboard" }, () => "dashboard")
        .exhaustive(),
    [settings],
  );

  // Use parameter list hook for dynamic parameter loading
  const { availableParameters, isLoadingParameters } = useParameterList({
    experience,

    // We're always using numeric IDs for previews.
    ...(settings.dashboardId && {
      dashboardId: settings.dashboardId as number,
    }),

    ...(settings.questionId && {
      questionId: Number(settings.questionId),
    }),
  });

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSetupSettings>) =>
      setRawSettings((prev) => {
        // Merging with a partial setting requires us to cast the type
        const mergedSettings = {
          ...(prev ?? defaultSettings),
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

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    experience,
    settings,
    replaceSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isEmbedSettingsLoaded,
    isLoadingParameters,
    availableParameters,
  };

  // Once the persisted settings are loaded, check if they are valid.
  // If they are, set them as the current settings.
  useEffect(() => {
    if (!isEmbedSettingsLoaded && !isRecentsLoading) {
      setRawSettings({
        ...settings,
        ...persistedSettings,

        // Override the persisted settings if `auth_method` is specified.
        // This is used for Embedding Hub.
        ...(authMethodOverride !== null && {
          useExistingUserSession: authMethodOverride === "user_session",
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
    authMethodOverride,
  ]);

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};

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
