import { getLockedPreviewParameters } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-locked-preview-parameters";
import type {
  EmbedResourceParameter,
  EmbeddingParameters,
  EmbeddingParametersValues,
} from "metabase/public/lib/types";
import { getParameterValue } from "metabase-lib/v1/parameters/utils/parameter-values";

export function getPreviewParamsBySlug({
  resourceParameters,
  embeddingParams,
  parameterValues,
}: {
  resourceParameters: EmbedResourceParameter[];
  embeddingParams: EmbeddingParameters;
  parameterValues: EmbeddingParametersValues;
}) {
  const lockedParameters = getLockedPreviewParameters(
    resourceParameters,
    embeddingParams,
  );

  return Object.fromEntries(
    lockedParameters.map((parameter) => {
      const value = getParameterValue({
        parameter,
        values: parameterValues,
        defaultRequired: true,
      });
      // metabase#47570
      const valueWithDefaultLockedParameterValue = value === null ? [] : value;
      return [parameter.slug, valueWithDefaultLockedParameterValue];
    }),
  );
}
