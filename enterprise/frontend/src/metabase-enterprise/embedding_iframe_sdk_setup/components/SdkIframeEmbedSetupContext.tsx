import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { P, match } from "ts-pattern";

import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import type { Parameter } from "metabase-types/api";

import { PERSIST_EMBED_SETTINGS_DEBOUNCE_MS } from "../constants";
import {
  useParameterList,
  usePersistByUserSetting,
  useRecentItems,
  useValidateApiKey,
} from "../hooks";
import type {
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupStep,
  SdkIframeEmbedSetupType,
} from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

interface SdkIframeEmbedSetupContextType {
  // Setup step navigation
  currentStep: SdkIframeEmbedSetupStep;
  setCurrentStep: (step: SdkIframeEmbedSetupStep) => void;

  // Embed settings
  embedType: SdkIframeEmbedSetupType;
  settings: SdkIframeEmbedSettings;
  setSettings: (settings: SdkIframeEmbedSettings) => void;
  updateSettings: (nextSettings: Partial<SdkIframeEmbedSettings>) => void;

  // Recent dashboards and questions
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  recentQuestions: SdkIframeEmbedSetupRecentItem[];

  addRecentItem: (
    type: "dashboard" | "question",
    recentItem: SdkIframeEmbedSetupRecentItem,
  ) => void;

  // Parameters for dashboards and questions
  availableParameters: Parameter[];
  isLoadingParameters: boolean;

  // API key validation
  isValidatingApiKey: boolean;
  apiKeyValidationError: string | null;
}

const SdkIframeEmbedSetupContext =
  createContext<SdkIframeEmbedSetupContextType | null>(null);

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const { recentDashboards, recentQuestions, addRecentItem } = useRecentItems();

  const [currentStep, setCurrentStep] =
    useState<SdkIframeEmbedSetupStep>("select-embed-type");

  const defaultEntityId = recentDashboards[0]?.id ?? 1;

  const [settings, setSettings] = useState<SdkIframeEmbedSettings>({
    apiKey: "",
    instanceUrl: "",
    ...getDefaultSdkIframeEmbedSettings("dashboard", defaultEntityId),
  });

  const embedType = useMemo(
    () =>
      match<SdkIframeEmbedSettings, SdkIframeEmbedSetupType>(settings)
        .with({ questionId: P.nonNullable }, () => "chart")
        .with({ template: "exploration" }, () => "exploration")
        .otherwise(() => "dashboard"),
    [settings],
  );

  // Use parameter list hook for dynamic parameter loading
  const { availableParameters, isLoadingParameters } = useParameterList({
    embedType,

    // We're always using numeric IDs for previews.
    ...(settings.dashboardId && { dashboardId: Number(settings.dashboardId) }),
    ...(settings.questionId && { questionId: Number(settings.questionId) }),
  });

  // API Key validation
  const { error: apiKeyValidationError, isValidating: isValidatingApiKey } =
    useValidateApiKey(settings.apiKey);

  const { storeSetting } = usePersistByUserSetting({
    onLoad: setSettings,
    settingKey: "sdk-iframe-embed-setup-settings",
    debounceMs: PERSIST_EMBED_SETTINGS_DEBOUNCE_MS,
  });

  const setAndPersistSettings = (settings: SdkIframeEmbedSettings) => {
    setSettings(settings);
    storeSetting(settings);
  };

  const updateSettings = (nextSettings: Partial<SdkIframeEmbedSettings>) =>
    setAndPersistSettings({
      ...settings,
      ...nextSettings,
    } as SdkIframeEmbedSettings);

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,

    embedType,
    settings,
    setSettings: setAndPersistSettings,
    updateSettings,

    recentDashboards,
    recentQuestions,
    addRecentItem,

    availableParameters,
    isLoadingParameters,

    isValidatingApiKey,
    apiKeyValidationError,
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
