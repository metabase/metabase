import { createContext, useContext } from "react";

import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import type { EmbeddingParametersValues } from "metabase/public/lib/types";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

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

  // Initial state
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;

  experience: SdkIframeEmbedSetupExperience;

  // Loaded resources
  resource: Dashboard | Card | null;
  isError: boolean;
  isLoading: boolean;
  isFetching: boolean;

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
  parametersValuesById: EmbeddingParametersValues;

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
