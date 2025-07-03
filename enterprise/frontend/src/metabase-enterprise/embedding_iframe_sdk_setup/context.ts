import { createContext, useContext } from "react";

import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupStep,
} from "./types";

export interface SdkIframeEmbedSetupContextType {
  // Navigation
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  experience: SdkIframeEmbedSetupExperience;

  // Embed settings
  settings: SdkIframeEmbedSettings;
  setSettings: (settings: SdkIframeEmbedSettings) => void;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSettings>) => void;

  // Recent items
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  recentQuestions: SdkIframeEmbedSetupRecentItem[];
  addRecentItem: (
    type: "dashboard" | "question",
    recentItem: SdkIframeEmbedSetupRecentItem,
  ) => void;

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
