import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { P, match } from "ts-pattern";

import { useUserSetting } from "metabase/common/hooks";

import { trackEmbedWizardSettingsUpdated } from "../analytics";
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
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);

  const [rawSettings, setRawSettings] = useState<SdkIframeEmbedSetupSettings>();

  const [persistedSettings, persistSettings] = useUserSetting(
    "sdk-iframe-embed-setup-settings",
    { debounceTimeout: USER_SETTINGS_DEBOUNCE_MS },
  );

  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const { recentDashboards, recentQuestions, addRecentItem } = useRecentItems();

  const defaultSettings = useMemo(() => {
    return getDefaultSdkIframeEmbedSettings(
      "dashboard",
      recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
    );
  }, [recentDashboards]);

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const settings = rawSettings ?? defaultSettings;

  // Which embed experience are we setting up?
  const experience = useMemo(
    () =>
      match<SdkIframeEmbedSetupSettings, SdkIframeEmbedSetupExperience>(
        settings,
      )
        .with({ questionId: P.nonNullable }, () => "chart")
        .with({ template: "exploration" }, () => "exploration")
        .otherwise(() => "dashboard"),
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
        trackEmbedWizardSettingsUpdated(nextSettings);

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
    addRecentItem,
    isEmbedSettingsLoaded,
    isLoadingParameters,
    availableParameters,
  };

  // Once the persisted settings are loaded, check if they are valid.
  // If they are, set them as the current settings.
  useEffect(() => {
    if (!isEmbedSettingsLoaded) {
      // We consider the settings to be valid if it has at least one
      // of the following properties set.
      const isPersistedSettingValid =
        persistedSettings?.dashboardId ||
        persistedSettings?.questionId ||
        persistedSettings?.template;

      if (isPersistedSettingValid) {
        setRawSettings(persistedSettings);
      }

      setEmbedSettingsLoaded(true);
    }
  }, [persistedSettings, isEmbedSettingsLoaded]);

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
