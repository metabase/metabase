import { useCallback, useMemo } from "react";

import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { useHideParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-hide-parameter";
import { useLockParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-lock-parameter";
import type { SdkIframeEmbedSetupContextType } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getSdkIframeEmbedSettingsForEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-sdk-iframe-embed-settings-for-embedding-parameters";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

export const useEmbeddingParameters = ({
  settings,
  updateSettings,
  resource,
  initialAvailableParameters,
  availableParameters,
}: Pick<SdkIframeEmbedSetupContextType, "settings" | "updateSettings"> & {
  resource: Dashboard | Card | null;
  initialAvailableParameters: Parameter[] | null;
  availableParameters: Parameter[];
}) => {
  const { isParameterHidden } = useHideParameter({ settings, updateSettings });
  const { isLockedParameter } = useLockParameter({ settings });

  // Wait until we have `hiddenParameters` or `lockedParameters` initialized
  const areEmbeddingParametersInitialized =
    (!!settings.dashboardId || !!settings.questionId) &&
    (!!settings.hiddenParameters || !!settings.lockedParameters);

  const buildEmbeddedParameters = useCallback(
    (parameters: Parameter[]) => {
      return parameters.reduce<EmbeddingParameters>((acc, { slug }) => {
        if (isLockedParameter(slug)) {
          acc[slug] = "locked";
        } else {
          acc[slug] = isParameterHidden(slug) ? "disabled" : "enabled";
        }

        return acc;
      }, {});
    },
    [isLockedParameter, isParameterHidden],
  );

  const initialEmbeddingParameters = useMemo(() => {
    if (!resource || !initialAvailableParameters) {
      return null;
    }

    return getDefaultEmbeddingParams(resource, initialAvailableParameters, {
      getAllParams: true,
    });
  }, [initialAvailableParameters, resource]);

  const embeddingParameters = useMemo(
    () => buildEmbeddedParameters(availableParameters),
    [buildEmbeddedParameters, availableParameters],
  );

  const onEmbeddingParametersChange = useCallback(
    (embeddingParameters: EmbeddingParameters) => {
      updateSettings(
        getSdkIframeEmbedSettingsForEmbeddingParameters(embeddingParameters),
      );
    },
    [updateSettings],
  );

  return {
    areEmbeddingParametersInitialized,
    initialEmbeddingParameters,
    embeddingParameters,
    onEmbeddingParametersChange,
  };
};
