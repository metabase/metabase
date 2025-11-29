import { countEmbeddingParameterOptions } from "metabase/embedding/lib/count-embedding-parameter-options";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import {
  trackStaticEmbedDiscarded,
  trackStaticEmbedPublished,
  trackStaticEmbedUnpublished,
} from "metabase/public/lib/analytics";
import type {
  EmbedResourceParameter,
  EmbeddingParameters,
} from "metabase/public/lib/types";

import { getDefaultEmbeddingParams } from "./get-default-embedding-params";

function convertResourceParametersToEmbeddingParams(
  resourceParameters: EmbedResourceParameter[],
) {
  const embeddingParams: EmbeddingParameters = {};
  for (const parameter of resourceParameters) {
    embeddingParams[parameter.slug] = "disabled";
  }

  return embeddingParams;
}

export const getStaticEmbedSetupPublishHandlers = ({
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,

  embeddingParams,
  setEmbeddingParams,

  exampleDashboardId,
}: StaticEmbedSetupPaneProps & {
  embeddingParams: EmbeddingParameters;
  setEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;

  exampleDashboardId: number | null;
}) => {
  const handleSave = async () => {
    if (!resource.enable_embedding) {
      await onUpdateEnableEmbedding(true);
    }
    await onUpdateEmbeddingParams(embeddingParams);
    trackStaticEmbedPublished({
      artifact: resourceType,
      resource,
      isExampleDashboard: exampleDashboardId === resource.id,
      params: countEmbeddingParameterOptions({
        ...convertResourceParametersToEmbeddingParams(resourceParameters),
        ...embeddingParams,
      }),
    });
  };

  const handleUnpublish = async () => {
    await onUpdateEnableEmbedding(false);
    trackStaticEmbedUnpublished({
      artifact: resourceType,
      resource,
    });
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(resource, resourceParameters));
    trackStaticEmbedDiscarded({
      artifact: resourceType,
    });
  };

  return {
    handleSave,
    handleUnpublish,
    handleDiscard,
  };
};
