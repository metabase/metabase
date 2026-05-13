import type {
  EmbedResourceParameter,
  EmbeddingParameters,
} from "metabase/embedding/types";

export function getLockedPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    (parameter) => embeddingParams[parameter.slug] === "locked",
  );
}
