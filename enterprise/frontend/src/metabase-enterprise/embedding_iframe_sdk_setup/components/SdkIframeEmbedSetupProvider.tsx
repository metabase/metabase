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

const DEFAULT_DASHBOARD_ID = 1;

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const [isEmbedOptionsLoaded, setEmbedOptionsLoaded] = useState(false);

  const { recentDashboards, recentQuestions, addRecentItem, isRecentsLoading } =
    useRecentItems();

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const instanceUrl = useSetting("site-url");

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    instanceUrl,
    ...getDefaultSdkIframeEmbedSettings("dashboard", defaultDashboardId),
    dashboardId: DEFAULT_DASHBOARD_ID,
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
    if (!isEmbedOptionsLoaded && !isRecentsLoading) {
      const defaultSettings = getDefaultSdkIframeEmbedSettings(
        "dashboard",
        recentDashboards[0]?.id ?? DEFAULT_DASHBOARD_ID,
      );

      updateSettings(defaultSettings);
      setEmbedOptionsLoaded(true);
    }
  }, [
    isRecentsLoading,
    isEmbedOptionsLoaded,
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
    isEmbedOptionsLoaded,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
