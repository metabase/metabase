import { type ReactNode, useMemo, useState } from "react";
import { match } from "ts-pattern";

import { useSearchQuery } from "metabase/api";

import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import {
  useGetCurrentResource,
  useParameters,
  useParametersValues,
  useRecentItems,
} from "../hooks";
import { useSdkIframeEmbedSettings } from "../hooks/use-sdk-iframe-embed-settings";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStep,
} from "../types";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const {
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isRecentsLoading,
  } = useRecentItems();

  const { data: searchData } = useSearchQuery({
    limit: 0,
    models: ["dataset"],
  });

  const modelCount = searchData?.total ?? 0;

  const [currentStep, setCurrentStep] = useState<SdkIframeEmbedSetupStep>(
    "select-embed-experience",
  );

  const { settings, isEmbedSettingsLoaded, replaceSettings, updateSettings } =
    useSdkIframeEmbedSettings({
      recentDashboards,
      isRecentsLoading,
      modelCount,
    });

  // Which embed experience are we setting up?
  const experience = useMemo(
    () =>
      match<SdkIframeEmbedSetupSettings, SdkIframeEmbedSetupExperience>(
        settings,
      )
        .with({ template: "exploration" }, () => "exploration")
        .with({ componentName: "metabase-question" }, () => "chart")
        .with({ componentName: "metabase-browser" }, () => "browser")
        .with({ componentName: "metabase-dashboard" }, () => "dashboard")
        .exhaustive(),
    [settings],
  );

  const { resource, isError, isLoading, isFetching } = useGetCurrentResource({
    experience,
    settings,
  });

  const { availableParameters } = useParameters({
    experience,
    resource,
  });

  const { parametersValuesById } = useParametersValues({
    settings,
    availableParameters,
  });

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    experience,
    resource,
    isError,
    isLoading,
    isFetching,
    settings,
    replaceSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isEmbedSettingsLoaded,
    availableParameters,
    parametersValuesById,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
