import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useSearchQuery } from "metabase/api";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { useEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/hooks/use-embedding-paramers";
import { useGetStaticEmbeddingSignedToken } from "metabase-enterprise/embedding_iframe_sdk_setup/hooks/use-get-static-embedding-signed-token";

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
import type { SdkIframeEmbedSetupStep } from "../types";
import { getExperienceFromSettings } from "../utils/get-default-sdk-iframe-embed-setting";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
  initialState,
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

  // Default to the embed options step if both resource type and id are provided.
  // This is to skip the experience and resource selection steps as we know both.
  const defaultStep: SdkIframeEmbedSetupStep = useMemo(() => {
    if (!!initialState?.resourceType && !!initialState?.resourceId) {
      return "select-embed-options";
    }

    return "select-embed-experience";
  }, [initialState]);

  const [currentStep, setCurrentStep] =
    useState<SdkIframeEmbedSetupStep>(defaultStep);

  const {
    settings,
    defaultSettings,
    isEmbedSettingsLoaded,
    replaceSettings,
    updateSettings,
  } = useSdkIframeEmbedSettings({
    initialState,
    recentDashboards,
    isRecentsLoading,
    modelCount,
  });

  // Which embed experience are we setting up?
  const experience = useMemo(
    () => getExperienceFromSettings(settings),
    [settings],
  );

  const { resource, isError, isLoading, isFetching } = useGetCurrentResource({
    experience,
    settings,
  });

  const { availableParameters, initialAvailableParameters } = useParameters({
    experience,
    resource,
  });
  const {
    embeddingParameters,
    initialEmbeddingParameters,
    onEmbeddingParametersChange,
  } = useEmbeddingParameters({
    settings,
    updateSettings,
    resource,
    initialAvailableParameters,
    availableParameters,
  });

  const { parametersValuesById, previewParameterValuesBySlug } =
    useParametersValues({
      settings,
      availableParameters,
      embeddingParameters,
    });

  const { signedToken: staticEmbeddingSignedToken } =
    useGetStaticEmbeddingSignedToken({
      settings,
      experience,
      previewParameterValuesBySlug,
      embeddingParameters,
    });

  useEffect(() => {
    if (!settings.isStatic || !initialEmbeddingParameters) {
      return;
    }

    onEmbeddingParametersChange(initialEmbeddingParameters);
  }, [
    settings.isStatic,
    initialEmbeddingParameters,
    onEmbeddingParametersChange,
  ]);

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    initialState,
    experience,
    resource,
    isError,
    isLoading,
    isFetching,
    settings,
    defaultSettings,
    replaceSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isEmbedSettingsLoaded,
    availableParameters,
    initialEmbeddingParameters,
    parametersValuesById,
    previewParameterValuesBySlug,
    embeddingParameters,
    onEmbeddingParametersChange,
    staticEmbeddingSignedToken,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
