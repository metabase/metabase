import _ from "underscore";

import type {
  EmbedResource,
  EmbedResourceParameter,
  EmbeddingParameters,
} from "metabase/public/lib/types";

export function getDefaultEmbeddingParams(
  resource: EmbedResource,
  resourceParameters: EmbedResourceParameter[],
): EmbeddingParameters {
  const validSlugs = resourceParameters.map((param) => param.slug);
  // We first pick only dashboard parameters with valid slugs
  const defaultParams = _.pick(resource.embedding_params || {}, validSlugs);
  // Then pick valid required dashboard parameters
  const validRequiredParams = resourceParameters.filter(
    (param) => param.slug && param.required,
  );

  // And for each required parameter set its value to "enabled"
  // (Editable) because this is the default for a required parameter.
  // This is needed to save embedding_params when a user clicks
  // "Publish" without changing parameter visibility.
  return validRequiredParams.reduce((acc, param) => {
    if (!acc[param.slug] || acc[param.slug] === "disabled") {
      acc[param.slug] = "enabled";
    }
    return acc;
  }, defaultParams);
}
