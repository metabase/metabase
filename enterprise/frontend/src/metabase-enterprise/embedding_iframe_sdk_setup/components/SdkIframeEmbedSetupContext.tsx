import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { P, match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupStep,
  SdkIframeEmbedSetupType,
} from "../types";

interface SdkIframeEmbedSetupContextType {
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  embedType: SdkIframeEmbedSetupType;
  settings: SdkIframeEmbedSettings;
  setSettings: (settings: SdkIframeEmbedSettings) => void;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSettings>) => void;
}

const SdkIframeEmbedSetupContext =
  createContext<SdkIframeEmbedSetupContextType | null>(null);

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const [currentStep, setCurrentStep] =
    useState<SdkIframeEmbedSetupStep>("select-embed-type");

  const instanceUrl = useSetting("site-url");

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    apiKey: "",
    dashboardId: 1,
    instanceUrl,
  });

  const embedType = useMemo(
    () =>
      match<SdkIframeEmbedSettings, SdkIframeEmbedSetupType>(settings)
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

export const useSdkIframeEmbedSetupContext = () => {
  const context = useContext(SdkIframeEmbedSetupContext);

  if (!context) {
    throw new Error(
      "useSdkIframeEmbedSetupContext must be used within a SdkIframeEmbedSetupProvider",
    );
  }

  return context;
};
