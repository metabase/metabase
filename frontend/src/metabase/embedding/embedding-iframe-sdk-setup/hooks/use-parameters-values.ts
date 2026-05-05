import { useMemo } from "react";

import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { convertParameterValuesBySlugToById } from "metabase/embedding/embedding-iframe-sdk-setup/utils/convert-parameter-values-by-slug-to-by-id";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Parameter } from "metabase-types/api";

interface UseParametersValuesProps {
  settings: SdkIframeEmbedSetupSettings;
  availableParameters: Parameter[];
  embeddingParameters: EmbeddingParameters;
}

const getParameterValuesBySlug = (settings: SdkIframeEmbedSetupSettings) => {
  if (settings.dashboardId) {
    return settings.initialParameters ?? {};
  }

  if (settings.questionId) {
    return settings.initialSqlParameters ?? {};
  }

  return {};
};

/**
 * Converts parameter values between slug-based and id-based formats.
 * Widgets expect values keyed by parameter.id, but embed settings store them by parameter.slug.
 */
export const useParametersValues = ({
  settings,
  availableParameters,
  embeddingParameters,
}: UseParametersValuesProps) => {
  const parametersValuesById = useMemo(() => {
    const valuesBySlug = getParameterValuesBySlug(settings);

    return convertParameterValuesBySlugToById(
      valuesBySlug,
      availableParameters,
    );
  }, [settings, availableParameters]);

  const previewParameterValuesBySlug = useMemo(
    () =>
      getPreviewParamsBySlug({
        resourceParameters: availableParameters,
        embeddingParams: embeddingParameters,
        parameterValues: parametersValuesById,
      }),
    [availableParameters, embeddingParameters, parametersValuesById],
  );

  return {
    parametersValuesById,
    previewParameterValuesBySlug,
  };
};
