import { type ReactNode, useCallback, useMemo, useState } from "react";
import { P, match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import {
  EMBED_FALLBACK_DASHBOARD_ID,
  PERSIST_EMBED_SETTINGS_DEBOUNCE_MS,
} from "../constants";
import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import {
  useParameterList,
  usePersistJsonViaUserSetting,
  useRecentItems,
} from "../hooks";
import type {
  SdkIframeEmbedSetupExperience,
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

  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const { recentDashboards, recentQuestions, addRecentItem, isRecentsLoading } =
    useRecentItems();

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const instanceUrl = useSetting("site-url");

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    instanceUrl,

    // This will be overridden by the last selected dashboard in the activity log.
    dashboardId: EMBED_FALLBACK_DASHBOARD_ID,

    // Default to using user sessions, as we do not know if
    // SSO for SDK is implemented on the user's backend, even when it is configured.
    useExistingUserSession: true,
  });

  // Which embed experience are we setting up?
  const experience = useMemo(
    () =>
      match<SdkIframeEmbedSettings, SdkIframeEmbedSetupExperience>(settings)
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

  const fallbackDashboardId =
    recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID;

  const handleEmbedSettingsRestored = useCallback(
    (settings: SdkIframeEmbedSettings | null) => {
      if (isEmbedSettingsLoaded) {
        return;
      }

      if (settings) {
        setSettings({ ...settings, instanceUrl });
      } else {
        // Apply the default settings if the user settings are empty.
        const defaults = getDefaultSdkIframeEmbedSettings(
          "dashboard",
          fallbackDashboardId,
        );

        setSettings(
          (prev) =>
            ({ ...prev, ...defaults, instanceUrl }) as SdkIframeEmbedSettings,
        );
      }

      setEmbedSettingsLoaded(true);
    },
    [fallbackDashboardId, isEmbedSettingsLoaded, instanceUrl],
  );

  const { storeSetting } = usePersistJsonViaUserSetting({
    settingKey: "sdk-iframe-embed-setup-settings",
    omitKeys: ["instanceUrl"],
    onRestore: handleEmbedSettingsRestored,
    debounceMs: PERSIST_EMBED_SETTINGS_DEBOUNCE_MS,

    // Wait until recents are loaded before restoring the settings.
    // This ensures the fallback id contains the most recent resource.
    skipRestore: isRecentsLoading,
  });

  const setAndPersistSettings = useCallback(
    (settings: SdkIframeEmbedSettings) => {
      setSettings(settings);
      storeSetting(settings);
    },
    [storeSetting],
  );

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSettings>) => {
      setSettings((prevSettings) => {
        const mergedSettings = {
          ...prevSettings,
          ...nextSettings,
        } as SdkIframeEmbedSettings;

        storeSetting(mergedSettings);

        return mergedSettings;
      });
    },
    [storeSetting],
  );

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    experience,
    settings,
    setSettings: setAndPersistSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    addRecentItem,
    isEmbedSettingsLoaded,
    isLoadingParameters,
    availableParameters,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
