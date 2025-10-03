import { useCallback, useMemo } from "react";

import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import { getHasSettingsChanges } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-settings-changes";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { useEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getStaticEmbeddingResourceType } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-static-embedding-resource-type";

type Props = Pick<StaticEmbedSetupPaneProps, "resource" | "resourceType"> & {
  initialEmbeddingParameters: EmbeddingParameters;
};

const SdkIframeStaticEmbeddingStatusBarInner = ({
  resource,
  resourceType,
  initialEmbeddingParameters,
}: Props) => {
  const exampleDashboardId = useSetting("example-dashboard-id");
  const {
    availableParameters: resourceParameters,
    isFetching,
    updateSettings,
  } = useSdkIframeEmbedSetupContext();
  const { buildEmbeddedParameters, getSettingsFromEmbeddingParameters } =
    useEmbeddingParameters();

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();
  const [updateCardEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();
  const [updateCardEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();

  const embeddingParameters = useMemo(
    () => buildEmbeddedParameters(resourceParameters),
    [buildEmbeddedParameters, resourceParameters],
  );

  const handleEmbeddingParametersChange = useCallback(
    (embeddingParameters: EmbeddingParameters) => {
      updateSettings(getSettingsFromEmbeddingParameters(embeddingParameters));
    },
    [getSettingsFromEmbeddingParameters, updateSettings],
  );

  const handleEnableEmbedding = async (enableEmbedding: boolean) => {
    const handlersMap = {
      dashboard: updateDashboardEnableEmbedding,
      question: updateCardEnableEmbedding,
    } as const;

    await handlersMap[resourceType]?.({
      id: resource.id as number,
      enable_embedding: enableEmbedding,
    });
  };

  const handleUpdateEmbeddingParams = async (
    embeddingParams: EmbeddingParameters,
  ) => {
    const handlersMap = {
      dashboard: updateDashboardEmbeddingParams,
      question: updateCardEmbeddingParams,
    } as const;

    await handlersMap[resourceType]?.({
      id: resource.id as number,
      embedding_params: embeddingParams,
    });
  };

  const hasSettingsChanges = getHasSettingsChanges({
    initialEmbeddingParams: initialEmbeddingParameters,
    embeddingParams: embeddingParameters,
  });

  const { handleSave, handleUnpublish, handleDiscard } =
    getStaticEmbedSetupPublishHandlers({
      resource,
      resourceType,
      resourceParameters,
      onUpdateEnableEmbedding: handleEnableEmbedding,
      onUpdateEmbeddingParams: handleUpdateEmbeddingParams,
      embeddingParams: embeddingParameters,
      setEmbeddingParams: handleEmbeddingParametersChange,
      exampleDashboardId,
    });

  return (
    <EmbedModalContentStatusBar
      resourceType={resourceType}
      isPublished={resource.enable_embedding}
      isFetching={isFetching}
      hasSettingsChanges={hasSettingsChanges}
      onSave={handleSave}
      onUnpublish={handleUnpublish}
      onDiscard={handleDiscard}
    />
  );
};

export const SdkIframeStaticEmbeddingStatusBar = () => {
  const { currentStep, settings, resource, initialEmbeddingParameters } =
    useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;
  const resourceType = getStaticEmbeddingResourceType(settings);

  const shouldShowForStep =
    currentStep === "select-embed-options" || currentStep === "get-code";
  const shouldShowForResource =
    resourceType === "dashboard" || resourceType === "question";

  if (!isStaticEmbedding || !shouldShowForStep || !shouldShowForResource) {
    return null;
  }

  if (!resource || !resourceType || !initialEmbeddingParameters) {
    return null;
  }

  return (
    <SdkIframeStaticEmbeddingStatusBarInner
      resource={resource}
      resourceType={resourceType}
      initialEmbeddingParameters={initialEmbeddingParameters}
    />
  );
};
