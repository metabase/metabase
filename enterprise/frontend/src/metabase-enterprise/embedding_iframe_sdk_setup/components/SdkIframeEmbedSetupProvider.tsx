import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { P, match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { EMBED_FALLBACK_DASHBOARD_ID } from "../constants";
import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import { useRecentItems } from "../hooks/use-recent-items";
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

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSettings>) =>
      setSettings(
        (prevSettings) =>
          ({
            ...prevSettings,
            ...nextSettings,
          }) as SdkIframeEmbedSettings,
      ),
    [setSettings],
  );

  useEffect(() => {
    if (!isEmbedSettingsLoaded && !isRecentsLoading) {
      const defaultSettings = getDefaultSdkIframeEmbedSettings(
        "dashboard",
        recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
      );

      updateSettings(defaultSettings);
      setEmbedSettingsLoaded(true);
    }
  }, [
    isRecentsLoading,
    isEmbedSettingsLoaded,
    recentDashboards,
    updateSettings,
  ]);

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    experience,
    settings,
    setSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    addRecentItem,
    isEmbedSettingsLoaded,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
