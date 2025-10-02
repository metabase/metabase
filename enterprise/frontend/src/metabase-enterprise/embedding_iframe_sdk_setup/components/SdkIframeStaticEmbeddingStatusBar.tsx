import { useMemo, useRef } from "react";
import { useMount } from "react-use";

import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import { getHasSettingsChanges } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-settings-changes";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { useStaticEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getStaticEmbeddingResourceType } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-static-embedding-resource-type";

type Props = Pick<StaticEmbedSetupPaneProps, "resource" | "resourceType">;

const SdkIframeStaticEmbeddingStatusBarInner = ({
  resource,
  resourceType,
}: Props) => {
  const exampleDashboardId = useSetting("example-dashboard-id");
  const { availableParameters: resourceParameters, isLoading } =
    useSdkIframeEmbedSetupContext();
  const { buildEmbeddedParameters, setEmbeddingParameters } =
    useStaticEmbeddingParameters();

  const initialResourceParametersRef = useRef(resourceParameters);

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();
  const [updateCardEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();
  const [updateCardEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();

  const initialEmbeddingParameters = getDefaultEmbeddingParams(
    resource,
    initialResourceParametersRef.current,
  );
  const embeddingParameters = useMemo(
    () => buildEmbeddedParameters(resourceParameters),
    [buildEmbeddedParameters, resourceParameters],
  );

  useMount(() => {
    setEmbeddingParameters(initialEmbeddingParameters);
  });

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

  const hasSettingsChanges =
    !isLoading &&
    getHasSettingsChanges({
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
      setEmbeddingParams: setEmbeddingParameters,
      exampleDashboardId,
    });

  return (
    <EmbedModalContentStatusBar
      resourceType={resourceType}
      isPublished={resource.enable_embedding}
      hasSettingsChanges={hasSettingsChanges}
      onSave={handleSave}
      onUnpublish={handleUnpublish}
      onDiscard={handleDiscard}
    />
  );
};

export const SdkIframeStaticEmbeddingStatusBar = () => {
  const { currentStep, settings, resource } = useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;
  const resourceType = getStaticEmbeddingResourceType(settings);

  const shouldShowForStep =
    currentStep === "select-embed-options" || currentStep === "get-code";

  if (!isStaticEmbedding || !resource || !resourceType || !shouldShowForStep) {
    return null;
  }

  return (
    <SdkIframeStaticEmbeddingStatusBarInner
      resource={resource}
      resourceType={resourceType}
    />
  );
};
