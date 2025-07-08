import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { P, match } from "ts-pattern";

import { useUserSetting } from "metabase/common/hooks";

import { EMBED_FALLBACK_DASHBOARD_ID } from "../constants";
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

  const [rawSettings, setSettings] = useState<SdkIframeEmbedSetupSettings>();

  const [persistedSettings, persistSetting] = useUserSetting(
    "sdk-iframe-embed-setup-settings",
    { shouldDebounce: true },
  );

  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const { recentDashboards, recentQuestions, addRecentItem } = useRecentItems();

  const fallbackDashboardId =
    recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID;

  const settings = useMemo(() => {
    return (
      rawSettings ??
      getDefaultSdkIframeEmbedSettings("dashboard", fallbackDashboardId)
    );
  }, [rawSettings, fallbackDashboardId]);

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

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

    ...(settings.questionId && { questionId: Number(settings.questionId) }),
  });

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSetupSettings>) =>
      setSettings((prev) => {
        // Merging with a partial setting requires us to cast the typeuse-sdk-iframe-embed-snippet.
        const mergedSettings = {
          ...prev,
          ...nextSettings,
        } as SdkIframeEmbedSetupSettings;

        persistSetting(mergedSettings);

        return mergedSettings;
      }),
    [persistSetting],
  );

  const replaceSettings = useCallback(
    (nextSettings: SdkIframeEmbedSetupSettings) => {
      setSettings(nextSettings);
      persistSetting(nextSettings);
    },
    [persistSetting],
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
        setSettings(persistedSettings);
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
