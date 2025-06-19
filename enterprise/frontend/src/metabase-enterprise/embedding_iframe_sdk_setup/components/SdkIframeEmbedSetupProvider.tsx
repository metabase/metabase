import { type ReactNode, useMemo, useState } from "react";
import { P, match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupStep,
} from "../types";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const instanceUrl = useSetting("site-url");

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    apiKey: "",
    instanceUrl,
    dashboardId: 1,
  });

  const embedType = useMemo(
    () =>
      match<SdkIframeEmbedSettings, SdkIframeEmbedSetupExperience>(settings)
        .with({ questionId: P.nonNullable }, () => "chart")
        .with({ template: "exploration" }, () => "exploration")
        .otherwise(() => "dashboard"),
    [settings],
  );

  const updateSettings = (nextSettings: Partial<SdkIframeEmbedSettings>) =>
    setSettings({
      ...settings,
      ...nextSettings,
    } as SdkIframeEmbedSettings);

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    embedType,
    settings,
    setSettings,
    updateSettings,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
