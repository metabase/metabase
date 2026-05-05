import _ from "underscore";

import type { EmbeddingParameters } from "metabase/public/lib/types";

function getNonDisabledEmbeddingParams(
  embeddingParams: EmbeddingParameters,
): EmbeddingParameters {
  return Object.keys(embeddingParams).reduce((result, key) => {
    if (embeddingParams[key] !== "disabled") {
      result[key] = embeddingParams[key];
    }

    return result;
  }, {} as EmbeddingParameters);
}

export function getHasParamsChanged({
  initialEmbeddingParams,
  embeddingParams,
}: {
  initialEmbeddingParams: EmbeddingParameters;
  embeddingParams: EmbeddingParameters;
}): boolean {
  const nonDisabledInitialEmbeddingParams = getNonDisabledEmbeddingParams(
    initialEmbeddingParams,
  );
  const nonDisabledEmbeddingParams =
    getNonDisabledEmbeddingParams(embeddingParams);

  return !_.isEqual(
    nonDisabledInitialEmbeddingParams,
    nonDisabledEmbeddingParams,
  );
}
