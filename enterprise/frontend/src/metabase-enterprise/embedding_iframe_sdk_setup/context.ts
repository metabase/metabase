import { createContext, useContext } from "react";

import type { Parameter } from "metabase-types/api";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupRecentItemType,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStep,
} from "./types";

export interface SdkIframeEmbedSetupContextType {
  // Navigation
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  experience: SdkIframeEmbedSetupExperience;

  // Embed settings
  settings: SdkIframeEmbedSetupSettings;
  defaultSettings: {
    resourceId: string | number;
    experience: SdkIframeEmbedSetupExperience;
  };
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSetupSettings>) => void;
  replaceSettings: (settings: SdkIframeEmbedSetupSettings) => void;

  // Recent items
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  recentQuestions: SdkIframeEmbedSetupRecentItem[];
  recentCollections: SdkIframeEmbedSetupRecentItem[];
  addRecentItem: (
    type: SdkIframeEmbedSetupRecentItemType,
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
