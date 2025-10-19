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
import { Card } from "metabase/ui";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";
import { isStepWithResource } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/is-step-with-resource";

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
      setEmbeddingParams: onEmbeddingParametersChange,
      exampleDashboardId,
    });

  return (
    <Card>
      <EmbedModalContentStatusBar
        display="column"
        resourceType={resourceType}
        isPublished={resource.enable_embedding}
        isFetching={isFetching}
        hasSettingsChanges={hasSettingsChanges}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />
    </Card>
  );
};

export const SdkIframeStaticEmbeddingStatusBar = () => {
  const {
    currentStep,
    settings,
    resource,
    experience,
    initialEmbeddingParameters,
  } = useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;

  const resourceType = getResourceTypeFromExperience(experience);

  const shouldShowForStep = isStepWithResource(currentStep);
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
