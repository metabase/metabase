import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { useLatest } from "react-use";

import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Parameter } from "metabase-types/api";

import {
  type RecentDashboard,
  type RecentQuestion,
  useRecentItems,
} from "../hooks/useRecentItems";
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

  // Recent items
  recentDashboards: RecentDashboard[];
  recentQuestions: RecentQuestion[];
  addRecentDashboard: (dashboard: RecentDashboard) => void;
  addRecentQuestion: (question: RecentQuestion) => void;

  // Dynamic parameters
  availableParameters: Parameter[];
  isLoadingParameters: boolean;
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
  const {
    recentDashboards,
    recentQuestions,
    addRecentDashboard,
    addRecentQuestion,
  } = useRecentItems();

  const [currentStep, setCurrentStep] = useState<Step>("select-embed-type");

  const [options, setOptions] = useState<EmbedPreviewOptions>({
    selectedType: "dashboard",
    settings: {
      apiKey: "",
      instanceUrl,

      // Default to dashboard with common settings
      dashboardId: 1,
      isDrillThroughEnabled: true,
      withDownloads: false,
      withTitle: true,
      initialParameters: {},
      hiddenParameters: [],
    },
  });

  const { settings } = options;

  // Fetch dashboard/question data for parameter extraction
  const { data: dashboard, isLoading: isDashboardLoading } =
    useGetDashboardQuery(
      settings.dashboardId ? { id: settings.dashboardId } : skipToken,
    );

  const { data: card, isLoading: isCardLoading } = useGetCardQuery(
    settings.questionId ? { id: settings.questionId as number } : skipToken,
  );

  const metadata = useSelector(getMetadata);
  const metadataRef = useLatest(metadata);

  // Extract parameters from the loaded dashboard/card
  const availableParameters = useMemo((): Parameter[] => {
    if (options.selectedType === "dashboard" && dashboard) {
      return dashboard.parameters || [];
    } else if (options.selectedType === "chart" && card) {
      return getCardUiParameters(card as Card, metadataRef.current) || [];
    }

    return [];
  }, [options.selectedType, dashboard, card, metadataRef]);

  const isLoadingParameters = isDashboardLoading || isCardLoading;

  const updateOptions = (newOptions: Partial<EmbedPreviewOptions>) => {
    setOptions((prev) => ({ ...prev, ...newOptions }));
  };

  const handleNext = () => {
    if (currentStep === "select-embed-type") {
      // Skip select-entity for exploration
      if (options.selectedType === "exploration") {
        setCurrentStep("configure");
      } else {
        setCurrentStep("select-entity");
      }
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    } else if (currentStep === "configure") {
      setCurrentStep("get-code");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-embed-type");
    } else if (currentStep === "configure") {
      // Skip select-entity for exploration
      if (options.selectedType === "exploration") {
        setCurrentStep("select-embed-type");
      } else {
        setCurrentStep("select-entity");
      }
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
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
    recentDashboards,
    recentQuestions,
    addRecentDashboard,
    addRecentQuestion,
    availableParameters,
    isLoadingParameters,
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
