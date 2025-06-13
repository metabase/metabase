import { type ReactNode, createContext, useContext, useState } from "react";

import type { EmbedPreviewOptions, Step } from "../types";

interface SdkIframeEmbedSetupContextType {
  // State
  currentStep: Step;
  options: EmbedPreviewOptions;

  // Actions
  setCurrentStep: (step: Step) => void;
  updateOptions: (newOptions: Partial<EmbedPreviewOptions>) => void;

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
  const [currentStep, setCurrentStep] = useState<Step>("select-type");
  const [options, setOptions] = useState<EmbedPreviewOptions>({
    selectedType: "dashboard",
    settings: {
      // Default to dashboard with common settings
      dashboardId: 1, // Default dashboard for preview
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
    if (currentStep === "select-type") {
      setCurrentStep("select-entity");
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    } else if (currentStep === "configure") {
      setCurrentStep("get-code");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-type");
    } else if (currentStep === "configure") {
      setCurrentStep("select-entity");
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
    }
  };

  const canGoNext = !(
    currentStep === "select-entity" &&
    !options.settings.dashboardId &&
    !options.settings.questionId &&
    options.settings.template !== "exploration"
  );
  const canGoBack = currentStep !== "select-type";

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    options,
    setCurrentStep,
    updateOptions,
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
