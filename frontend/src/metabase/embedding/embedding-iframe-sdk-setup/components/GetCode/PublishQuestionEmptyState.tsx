import { jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { useSetting } from "metabase/common/hooks";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { Anchor, Loader } from "metabase/ui";

export const PublishQuestionEmptyState = () => {
  const exampleDashboardId = useSetting("example-dashboard-id");

  const {
    experience,
    resource,
    isFetching,
    availableParameters: resourceParameters,
    embeddingParameters,
    onEmbeddingParametersChange,
  } = useSdkIframeEmbedSetupContext();

  const resourceType = getResourceTypeFromExperience(experience);

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();
  const [updateCardEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();
  const [updateCardEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();

  const handleEnableEmbedding = async (enableEmbedding: boolean) => {
    if (!resource || !resourceType) {
      return;
    }

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
    if (!resource || !resourceType) {
      return;
    }

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

  if (!resource || !resourceType) {
    return null;
  }

  const { handleSave } = getStaticEmbedSetupPublishHandlers({
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
    <EmptyState
      illustrationElement={<img src={EmptyDashboardBot} />}
      message={
        isFetching ? (
          <Loader size="xs" />
        ) : (
          jt`The get the embedding code, ${(
            <Anchor
              key="publish-guest-embed-question"
              target="_blank"
              size="md"
              lh="lg"
              onClick={handleSave}
            >
              {t`publish this question`}
            </Anchor>
          )}.`
        )
      }
    />
  );
};
