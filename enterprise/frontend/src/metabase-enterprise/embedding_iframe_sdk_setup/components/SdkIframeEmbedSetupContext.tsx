import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import type { Parameter } from "metabase-types/api";

import { useParameterList } from "../hooks/use-parameter-list";
import {
  type RecentDashboard,
  type RecentQuestion,
  useRecentItems,
} from "../hooks/use-recent-items";
import type { EmbedType, Step } from "../types";

interface SdkIframeEmbedSetupContextType {
  // State
  currentStep: Step;
  selectedType: EmbedType;
  settings: SdkIframeEmbedSettings;

  // Actions
  setCurrentStep: (step: Step) => void;
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
  toggleParameterVisibility: (parameterName: string) => void;
  isParameterHidden: (parameterName: string) => boolean;
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

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    apiKey: "",
    instanceUrl,

    // Default to dashboard with common settings
    dashboardId: 1,
    isDrillThroughEnabled: true,
    withDownloads: false,
    withTitle: true,
    initialParameters: {},
    hiddenParameters: [],
  });

  const selectedType = useMemo(() => {
    if (settings.questionId) {
      return "chart";
    }

    if (settings.template === "exploration") {
      return "exploration";
    }

    return "dashboard";
  }, [settings]);

  // Use parameter list hook for dynamic parameter loading
  const { availableParameters, isLoadingParameters } = useParameterList({
    selectedType,

    // We're always using numeric IDs for previews.
    ...(settings.dashboardId && { dashboardId: Number(settings.dashboardId) }),
    ...(settings.questionId && { questionId: Number(settings.questionId) }),
  });

  const handleNext = () => {
    if (currentStep === "select-embed-type") {
      // Skip select-entity for exploration
      if (selectedType === "exploration") {
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
      if (selectedType === "exploration") {
        setCurrentStep("select-embed-type");
      } else {
        setCurrentStep("select-entity");
      }
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
    }
  };

  const updateSettings = (nextSettings: Partial<SdkIframeEmbedSettings>) =>
    setSettings(
      (prevSettings) =>
        ({ ...prevSettings, ...nextSettings }) as SdkIframeEmbedSettings,
    );

  // Parameter visibility management (only for dashboards)
  const toggleParameterVisibility = (parameterName: string) => {
    if (selectedType !== "dashboard" || !("hiddenParameters" in settings)) {
      return; // Only dashboards support hidden parameters
    }

    const currentHidden = settings.hiddenParameters || [];
    const isCurrentlyHidden = currentHidden.includes(parameterName);

    const hiddenParameters = isCurrentlyHidden
      ? currentHidden.filter((name) => name !== parameterName)
      : [...currentHidden, parameterName];

    updateSettings({ hiddenParameters });
  };

  const isParameterHidden = (parameterName: string) => {
    // only dashboards support hidden parameters
    if (selectedType !== "dashboard" || !("hiddenParameters" in settings)) {
      return false;
    }

    return (settings.hiddenParameters || []).includes(parameterName);
  };

  const canGoNext = !(
    currentStep === "select-entity" &&
    !settings.dashboardId &&
    !settings.questionId &&
    settings.template !== "exploration"
  );

  const canGoBack = currentStep !== "select-embed-type";

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    selectedType,
    settings,
    setCurrentStep,
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
    toggleParameterVisibility,
    isParameterHidden,
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
