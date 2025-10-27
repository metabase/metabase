import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import {
  trackStaticEmbedDiscarded,
  trackStaticEmbedPublished,
  trackStaticEmbedUnpublished,
} from "metabase/public/lib/analytics";
import type {
  EmbedResourceParameter,
  EmbeddingParameterVisibility,
  EmbeddingParameters,
} from "metabase/public/lib/types";

import { getDefaultEmbeddingParams } from "./get-default-embedding-params";

const countEmbeddingParameterOptions = (
  embeddingParams: EmbeddingParameters,
): Record<EmbeddingParameterVisibility, number> =>
  Object.values(embeddingParams).reduce(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    { disabled: 0, locked: 0, enabled: 0 } as Record<
      EmbeddingParameterVisibility,
      number
    >,
  );

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

  getAllParamsOnDiscard,
}: StaticEmbedSetupPaneProps & {
  embeddingParams: EmbeddingParameters;
  setEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;

  exampleDashboardId: number | null;

  getAllParamsOnDiscard: boolean;
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
    setEmbeddingParams(
      getDefaultEmbeddingParams(resource, resourceParameters, {
        getAllParams: getAllParamsOnDiscard,
      }),
    );
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
