import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-use";

import { useSearchQuery } from "metabase/api";
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
import type {
  SdkIframeEmbedSetupStep,
  SdkIframeEmbedSetupUrlParams,
} from "../types";
import { getExperienceFromSettings } from "../utils/get-default-sdk-iframe-embed-setting";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
}: SdkIframeEmbedSetupProviderProps) => {
  const location = useLocation();

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

  // EmbeddingHub passes `auth_method`.
  // EmbedContentModal passes `resource_type` and `resource_id`.
  const urlParams: SdkIframeEmbedSetupUrlParams = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return {
      authMethod: params.get("auth_method"),
      resourceType: params.get("resource_type"),
      resourceId: params.get("resource_id"),
    };
  }, [location.search]);

  // Default to the embed options step if both resource type and id are provided.
  // This is to skip the experience and resource selection steps as we know both.
  const defaultStep: SdkIframeEmbedSetupStep = useMemo(() => {
    if (urlParams.resourceType !== null && urlParams.resourceId !== null) {
      return "select-embed-options";
    }

    return "select-embed-experience";
  }, [urlParams]);

  const [currentStep, setCurrentStep] =
    useState<SdkIframeEmbedSetupStep>(defaultStep);

  const {
    settings,
    defaultSettings,
    isEmbedSettingsLoaded,
    replaceSettings,
    updateSettings,
  } = useSdkIframeEmbedSettings({
    urlParams,
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
