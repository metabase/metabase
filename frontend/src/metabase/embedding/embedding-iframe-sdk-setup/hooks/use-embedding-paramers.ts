import { useCallback, useEffect, useMemo, useRef } from "react";

import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useParameterVisibility } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-parameter-visibility";
import { getSdkIframeEmbedSettingsForEmbeddingParameters } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-sdk-iframe-embed-settings-for-embedding-parameters";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

const buildEmbeddingParametersFromSettings = (
  parameters: Parameter[],
  isLocked: (slug: string) => boolean,
  isHidden: (slug: string) => boolean,
): EmbeddingParameters => {
  return parameters.reduce<EmbeddingParameters>((acc, { slug }) => {
    if (isLocked(slug)) {
      acc[slug] = "locked";
    } else if (isHidden(slug)) {
      acc[slug] = "disabled";
    } else {
      acc[slug] = "enabled";
    }
    return acc;
  }, {});
};

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
  const { isHiddenParameter, isLockedParameter } = useParameterVisibility({
    settings,
    updateSettings,
  });

  // Track whether we've already initialized the embedding parameters
  const hasInitializedRef = useRef(false);

  // Wait until we have `hiddenParameters` or `lockedParameters` initialized
  const areEmbeddingParametersInitialized =
    (!!settings.dashboardId || !!settings.questionId) &&
    (!!settings.hiddenParameters || !!settings.lockedParameters);

  const initialEmbeddingParameters = useMemo(() => {
    if (!resource || !initialAvailableParameters) {
      return null;
    }

    return getDefaultEmbeddingParams(resource, initialAvailableParameters, {
      getAllParams: true,
    });
  }, [initialAvailableParameters, resource]);

  const embeddingParameters = useMemo(
    () =>
      buildEmbeddingParametersFromSettings(
        availableParameters,
        isLockedParameter,
        isHiddenParameter,
      ),
    [availableParameters, isLockedParameter, isHiddenParameter],
  );

  const onEmbeddingParametersChange = useCallback(
    (embeddingParameters: EmbeddingParameters) => {
      updateSettings(
        getSdkIframeEmbedSettingsForEmbeddingParameters(embeddingParameters),
      );
    },
    [updateSettings],
  );

  // Call onEmbeddingParametersChange ONLY ONCE when initialEmbeddingParameters
  // changes from null to a non-null value (for guest embeds only)
  useEffect(() => {
    if (
      !hasInitializedRef.current &&
      settings.isGuestEmbed &&
      initialEmbeddingParameters !== null
    ) {
      hasInitializedRef.current = true;
      onEmbeddingParametersChange(initialEmbeddingParameters);
    }
  }, [
    initialEmbeddingParameters,
    onEmbeddingParametersChange,
    settings.isGuestEmbed,
  ]);

  return {
    areEmbeddingParametersInitialized,
    initialEmbeddingParameters,
    embeddingParameters,
    onEmbeddingParametersChange,
  };
};
