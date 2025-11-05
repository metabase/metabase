import { useMemo } from "react";
import { P, match } from "ts-pattern";

import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { convertParameterValuesBySlugToById } from "metabase/embedding/embedding-iframe-sdk-setup/utils/convert-parameter-values-by-slug-to-by-id";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import type {
  EmbeddingParameters,
  EmbeddingParametersValues,
} from "metabase/public/lib/types";
import type { Parameter } from "metabase-types/api";

export const useParametersValues = ({
  settings,
  availableParameters,
  embeddingParameters,
}: {
  settings: SdkIframeEmbedSetupSettings;
  availableParameters: Parameter[];
  embeddingParameters: EmbeddingParameters;
}) => {
  /**
   * Widgets (and most of metabase logic) expect parameter values keyed by
   * **parameter.id**, but in the embed flow settings we store them by
   * **parameter.slug**, as the public API of embeds wants them by slug
   *
   * Here we convert them to "by-id" to make widgets work properly.
   */
  const parametersValuesById: EmbeddingParametersValues = useMemo(() => {
    const valuesBySlug = match(settings)
      .with({ dashboardId: P.nonNullable }, (s) => s.initialParameters ?? {})
      .with({ questionId: P.nonNullable }, (s) => s.initialSqlParameters ?? {})
      .otherwise(() => ({}));

    return convertParameterValuesBySlugToById(
      valuesBySlug,
      availableParameters,
    );
  }, [availableParameters, settings]);

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
