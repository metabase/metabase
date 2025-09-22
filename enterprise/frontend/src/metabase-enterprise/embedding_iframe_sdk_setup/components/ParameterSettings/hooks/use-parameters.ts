import { useCallback } from "react";
import { P, match } from "ts-pattern";

import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

export const useParameters = () => {
  const { settings, availableParameters } = useSdkIframeEmbedSetupContext();

  const mapValuesBySlugToById = useCallback(
    (
      valuesBySlug: Record<string, any> | undefined,
      params: { id: string; slug: string }[],
    ) => {
      if (!valuesBySlug) {
        return {};
      }

      return params.reduce<Record<string, any>>((byId, param) => {
        if (param.slug in valuesBySlug) {
          byId[param.id] = valuesBySlug[param.slug];
        }
        return byId;
      }, {});
    },
    [],
  );

  const getParameterValuesBySlug = useCallback(() => {
    return match(settings)
      .with({ dashboardId: P.nonNullable }, (s) => s.initialParameters ?? {})
      .with({ questionId: P.nonNullable }, (s) => s.initialSqlParameters ?? {})
      .otherwise(() => ({}));
  }, [settings]);

  /**
   * Widgets (and most of metabase logic) expect parameter values keyed by
   * **parameter.id**, but in the embed flow settings we store them by
   * **parameter.slug**, as the public API of embeds wants them by slug
   *
   * Here we convert them to "by-id" to make widgets work properly.
   */
  const getParameterValuesById = useCallback(() => {
    const valuesBySlug = getParameterValuesBySlug();

    return mapValuesBySlugToById(valuesBySlug, availableParameters);
  }, [availableParameters, getParameterValuesBySlug, mapValuesBySlugToById]);

  return { getParameterValuesBySlug, getParameterValuesById };
};
