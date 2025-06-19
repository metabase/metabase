import { createContext, useContext } from "react";

import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupStep,
} from "./types";

export interface SdkIframeEmbedSetupContextType {
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  experience: SdkIframeEmbedSetupExperience;
  settings: SdkIframeEmbedSettings;
  setSettings: (settings: SdkIframeEmbedSettings) => void;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSettings>) => void;
}

export const SdkIframeEmbedSetupContext =
  createContext<SdkIframeEmbedSetupContextType | null>(null);

export const useSdkIframeEmbedSetupContext = () => {
  const context = useContext(SdkIframeEmbedSetupContext);

  if (!context) {
    throw new Error(
      "useSdkIframeEmbedSetupContext must be used within a SdkIframeEmbedSetupProvider",
    );
  }

  return context;
};
