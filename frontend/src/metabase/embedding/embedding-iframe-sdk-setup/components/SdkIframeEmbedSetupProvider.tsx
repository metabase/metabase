import { type ReactNode, useMemo, useState } from "react";
import { useMount } from "react-use";

import { useSearchQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { trackEmbedWizardOpened } from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { useEmbeddingParameters } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters";
import { useGetGuestEmbedSignedToken } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-get-guest-embed-signed-token";
import { useIsSsoEnabledAndConfigured } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-is-sso-enabled-and-configured";
import { shouldAllowPreviewAndNavigation } from "metabase/embedding/embedding-iframe-sdk-setup/utils/should-allow-preview-and-navigation";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  type SdkIframeEmbedSetupModalInitialState,
} from "metabase/plugins";

import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import {
  useAvailableParameters,
  useGetCurrentResource,
  useParametersValues,
  useRecentItems,
  useSdkIframeEmbedNavigation,
} from "../hooks";
import { useSdkIframeEmbedSettings } from "../hooks/use-sdk-iframe-embed-settings";
import type { SdkIframeEmbedSetupStep } from "../types";
import { getExperienceFromSettings } from "../utils/get-default-sdk-iframe-embed-setting";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  onClose: () => void;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
  initialState,
  onClose,
}: SdkIframeEmbedSetupProviderProps) => {
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const isSimpleEmbeddingTermsAccepted = !useSetting("show-simple-embed-terms");

  const isGuestEmbedsEnabled = useSetting("enable-embedding-static");
  const isGuestEmbedsTermsAccepted = !useSetting("show-static-embed-terms");

  const isSsoEnabledAndConfigured = useIsSsoEnabledAndConfigured();

  useMount(() => {
    trackEmbedWizardOpened();
  });

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
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isSsoEnabledAndConfigured,
  });

  // Which embed experience are we setting up?
  const experience = useMemo(
    () => getExperienceFromSettings(settings),
    [settings],
  );

  const { resource, isError, isLoading, isFetching } = useGetCurrentResource({
    experience,
    dashboardId: settings.dashboardId,
    questionId: settings.questionId,
  });

  const { availableParameters, initialAvailableParameters } =
    useAvailableParameters({
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
    availableParameters,
    initialAvailableParameters,
  });

  const { parametersValuesById, previewParameterValuesBySlug } =
    useParametersValues({
      settings,
      availableParameters,
      embeddingParameters,
    });

  const {
    signedTokenForSnippet: guestEmbedSignedTokenForSnippet,
    signedTokenForPreview: guestEmbedSignedTokenForPreview,
  } = useGetGuestEmbedSignedToken({
    settings,
    experience,
    previewParameterValuesBySlug,
    embeddingParameters,
  });

  const { handleNext, handleBack, canGoBack, isFirstStep, isLastStep } =
    useSdkIframeEmbedNavigation({
      isSimpleEmbedFeatureAvailable,
      isGuestEmbedsEnabled,
      isSsoEnabledAndConfigured,
      initialState,
      experience,
      resource,
      currentStep,
      defaultStep,
      setCurrentStep,
      settings,
      defaultSettings,
      embeddingParameters,
    });

  const isGuestEmbed = !!settings.isGuest;
  const allowPreviewAndNavigation = shouldAllowPreviewAndNavigation({
    isGuestEmbed,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
  });

  const value: SdkIframeEmbedSetupContextType = {
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
    isSsoEnabledAndConfigured,
    currentStep,
    setCurrentStep,
    handleNext,
    handleBack,
    canGoBack,
    isFirstStep,
    isLastStep,
    initialState,
    allowPreviewAndNavigation,
    experience,
    resource,
    isError,
    isLoading,
    isFetching,
    isRecentsLoading,
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
    guestEmbedSignedTokenForSnippet,
    guestEmbedSignedTokenForPreview,
    onClose,
  };

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};
