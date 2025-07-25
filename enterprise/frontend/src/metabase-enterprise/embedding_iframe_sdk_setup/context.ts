import { createContext, useContext } from "react";

import type { Parameter } from "metabase-types/api";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStep,
} from "./types";

export interface SdkIframeEmbedSetupContextType {
  // Navigation
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  experience: SdkIframeEmbedSetupExperience;
  setExperience: (experience: SdkIframeEmbedSetupExperience) => void;

  // Embed settings
  settings: SdkIframeEmbedSetupSettings;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSetupSettings>) => void;
  replaceSettings: (settings: SdkIframeEmbedSetupSettings) => void;

  // Recent items
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  recentQuestions: SdkIframeEmbedSetupRecentItem[];
  addRecentItem: (
    type: "dashboard" | "question",
    recentItem: SdkIframeEmbedSetupRecentItem,
  ) => void;

  // Parameters for dashboards and questions
  availableParameters: Parameter[];
  isLoadingParameters: boolean;

  isEmbedSettingsLoaded: boolean;
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
