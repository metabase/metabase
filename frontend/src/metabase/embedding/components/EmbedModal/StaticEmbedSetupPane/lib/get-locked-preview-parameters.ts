import type {
  EmbedResourceParameter,
  EmbeddingParameters,
} from "metabase/embed/types";

export function getLockedPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    (parameter) => embeddingParams[parameter.slug] === "locked",
  );
}
