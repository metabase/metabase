import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { isStepWithResource } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-step-with-resource";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import { getHasParamsChanged } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-params-changed";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { Card } from "metabase/ui";

type Props = Pick<StaticEmbedSetupPaneProps, "resource" | "resourceType"> & {
  initialEmbeddingParameters: EmbeddingParameters;
};

const SdkIframeGuestEmbedStatusBarInner = ({
  resource,
  resourceType,
  initialEmbeddingParameters,
}: Props) => {
  const exampleDashboardId = useSetting("example-dashboard-id");
  const {
    availableParameters: resourceParameters,
    embeddingParameters,
    isFetching,
    onEmbeddingParametersChange,
  } = useSdkIframeEmbedSetupContext();

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();
  const [updateCardEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();
  const [updateCardEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();

  const handleEnableEmbedding = async (enableEmbedding: boolean) => {
    const handlersMap = {
      dashboard: updateDashboardEnableEmbedding,
      question: updateCardEnableEmbedding,
    } as const;

    await handlersMap[resourceType]?.({
      id: resource.id as number,
      enable_embedding: enableEmbedding,
      embedding_type: enableEmbedding ? GUEST_EMBED_EMBEDDING_TYPE : null,
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
      embedding_type: GUEST_EMBED_EMBEDDING_TYPE,
    });
  };

  const hasParamsChanged = getHasParamsChanged({
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
      setEmbeddingParams: onEmbeddingParametersChange,
      exampleDashboardId,
    });

  return (
    <Card>
      <EmbedModalContentStatusBar
        resourceType={resourceType}
        isPublished={resource.enable_embedding}
        isFetching={isFetching}
        hasSettingsChanges={hasParamsChanged}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />
    </Card>
  );
};

export const SdkIframeGuestEmbedStatusBar = () => {
  const {
    currentStep,
    settings,
    resource,
    experience,
    initialEmbeddingParameters,
  } = useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;

  const resourceType = getResourceTypeFromExperience(experience);

  const shouldShowForStep = isStepWithResource(currentStep);
  const shouldShowForResource =
    resourceType === "dashboard" || resourceType === "question";

  if (!isGuestEmbed || !shouldShowForStep || !shouldShowForResource) {
    return null;
  }

  if (!resource || !resourceType || !initialEmbeddingParameters) {
    return null;
  }

  return (
    <SdkIframeGuestEmbedStatusBarInner
      resource={resource}
      resourceType={resourceType}
      initialEmbeddingParameters={initialEmbeddingParameters}
    />
  );
};
