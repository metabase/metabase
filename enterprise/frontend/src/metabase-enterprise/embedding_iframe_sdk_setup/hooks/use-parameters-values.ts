import { useMemo } from "react";
import { P, match } from "ts-pattern";

import type { EmbeddingParametersValues } from "metabase/public/lib/types";
import type { SdkIframeEmbedSetupSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/types";
import { convertParameterValuesBySlugToById } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/convert-parameter-values-by-slug-to-by-id";
import type { Parameter } from "metabase-types/api";

export const useParametersValues = ({
  settings,
  availableParameters,
}: {
  settings: SdkIframeEmbedSetupSettings;
  availableParameters: Parameter[];
}) => {
  /**
   * Widgets (and most of metabase logic) expect parameter values keyed by
   * **parameter.id**, but in the embed flow settings we store them by
   * **parameter.slug**, as the public API of embeds wants them by slug
   *
   * Here we convert them to "by-id" to make widgets work properly.
   */
  const parameterValuesById: EmbeddingParametersValues = useMemo(() => {
    const valuesBySlug = match(settings)
      .with({ dashboardId: P.nonNullable }, (s) => s.initialParameters ?? {})
      .with({ questionId: P.nonNullable }, (s) => s.initialSqlParameters ?? {})
      .otherwise(() => ({}));

    return convertParameterValuesBySlugToById(
      valuesBySlug,
      availableParameters,
    );
  }, [availableParameters, settings]);

  return {
    parameterValuesById,
  };
};
