import { type ReactNode, createContext, useContext, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { SDK_IFRAME_EMBED_STEPS } from "../constants";
import type { EmbedPreviewOptions, Step } from "../types";

interface SdkIframeEmbedSetupContextType {
  // State
  currentStep: Step;
  options: EmbedPreviewOptions;

  // Actions
  setCurrentStep: (step: Step) => void;
  updateOptions: (nextOptions: Partial<EmbedPreviewOptions>) => void;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSettings>) => void;

  // Navigation helpers
  handleNext: () => void;
  handleBack: () => void;
  canGoNext: boolean;
  canGoBack: boolean;
}

const SdkIframeEmbedSetupContext =
  createContext<SdkIframeEmbedSetupContextType | null>(null);

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const instanceUrl = useSetting("site-url");

  const [currentStep, setCurrentStep] = useState<Step>("select-embed-type");

  const [options, setOptions] = useState<EmbedPreviewOptions>({
    selectedType: "dashboard",
    settings: {
      apiKey: "",
      instanceUrl,

      // Default to dashboard with common settings
      dashboardId: 1,
      isDrillThroughEnabled: false,
      withDownloads: false,
      withTitle: true,
      initialParameters: {},
      hiddenParameters: [],
    },
  });

  const updateOptions = (newOptions: Partial<EmbedPreviewOptions>) => {
    setOptions((prev) => ({ ...prev, ...newOptions }));
  };

  const handleNext = () => {
    const currentIndex = SDK_IFRAME_EMBED_STEPS.indexOf(currentStep);
    if (currentIndex < SDK_IFRAME_EMBED_STEPS.length - 1) {
      setCurrentStep(SDK_IFRAME_EMBED_STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = SDK_IFRAME_EMBED_STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(SDK_IFRAME_EMBED_STEPS[currentIndex - 1]);
    }
  };

  const updateSettings = (nextSettings: Partial<SdkIframeEmbedSettings>) => {
    updateOptions({
      ...options,
      settings: {
        ...options.settings,
        ...nextSettings,
      } as SdkIframeEmbedSettings,
    });
  };

  const canGoNext = !(
    currentStep === "select-entity" &&
    !options.settings.dashboardId &&
    !options.settings.questionId &&
    options.settings.template !== "exploration"
  );

  const canGoBack = currentStep !== "select-embed-type";

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    options,
    setCurrentStep,
    updateOptions,
    updateSettings,
    handleNext,
    handleBack,
    canGoNext,
    canGoBack,
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
      "useSdkIframeEmbedSetup must be used within SdkIframeEmbedSetupProvider",
    );
  }
  return context;
};
