import { type ReactNode, useMemo, useState } from "react";
import { useLocation } from "react-use";
import { match } from "ts-pattern";

import { useSearchQuery } from "metabase/api";
import { useGetCurrentResource } from "metabase-enterprise/embedding_iframe_sdk_setup/hooks/use-get-current-resource";

import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import { useParameterList, useRecentItems } from "../hooks";
import { useSettings } from "../hooks/use-settings";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStep,
  SdkIframeEmbedSetupUrlParams,
} from "../types";

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

  const { settings, isEmbedSettingsLoaded, replaceSettings, updateSettings } =
    useSettings({
      urlParams,
      recentDashboards,
      isRecentsLoading,
      modelCount,
    });

  const { resource, isLoading, isFetching } = useGetCurrentResource(settings);

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

  const { availableParameters } = useParameterList({
    experience,
    resource,
  });

  const value: SdkIframeEmbedSetupContextType = {
    currentStep,
    setCurrentStep,
    experience,
    resource,
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
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
