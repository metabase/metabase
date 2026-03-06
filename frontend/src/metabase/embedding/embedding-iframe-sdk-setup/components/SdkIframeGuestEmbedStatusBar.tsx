import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useToggleResourceEmbedding } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-toggle-resource-embedding";
import { isStepWithResource } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-step-with-resource";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import { getHasParamsChanged } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-params-changed";
import { Card } from "metabase/ui";

export const SdkIframeGuestEmbedStatusBar = () => {
  const {
    currentStep,
    settings,
    resource,
    embeddingParameters,
    isFetching,
    initialEmbeddingParameters,
    isGuestEmbedsEnabled,
  } = useSdkIframeEmbedSetupContext();

  const toggleEmbedding = useToggleResourceEmbedding();

  const isGuestEmbed = !!settings.isGuest;
  const shouldShowForStep = isStepWithResource(currentStep);
  const shouldShowForResource =
    toggleEmbedding?.resourceType === "dashboard" ||
    toggleEmbedding?.resourceType === "question";

  if (
    !isGuestEmbed ||
    !isGuestEmbedsEnabled ||
    !shouldShowForStep ||
    !shouldShowForResource
  ) {
    return null;
  }

  if (!resource || !toggleEmbedding || !initialEmbeddingParameters) {
    return null;
  }

  const { handleSave, handleUnpublish, handleDiscard, resourceType } =
    toggleEmbedding;

  const hasParamsChanged = getHasParamsChanged({
    initialEmbeddingParams: initialEmbeddingParameters,
    embeddingParams: embeddingParameters,
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
