import { type ReactNode, useMemo, useState } from "react";
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

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const { recentDashboards, recentQuestions, addRecentItem } = useRecentItems();

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const instanceUrl = useSetting("site-url");

  const defaultDashboardId = recentDashboards[0]?.id ?? 1;

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    instanceUrl,
    ...getDefaultSdkIframeEmbedSettings("dashboard", defaultDashboardId),
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

  const updateSettings = (nextSettings: Partial<SdkIframeEmbedSettings>) =>
    setSettings(
      (prevSettings) =>
        ({
          ...prevSettings,
          ...nextSettings,
        }) as SdkIframeEmbedSettings,
    );

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
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
