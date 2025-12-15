import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getResourceTypeFromExperience } from "../utils/get-resource-type-from-experience";

export const useToggleResourceEmbedding = () => {
  const exampleDashboardId = useSetting("example-dashboard-id");

  const {
    experience,
    resource,
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

  if (!resource || !resourceType) {
    return null;
  }

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

  return {
    handleSave,
    handleUnpublish,
    handleDiscard,
    resourceType,
  };
};
