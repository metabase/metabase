import { useCallback, useEffect, useMemo, useRef } from "react";

import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useEmbeddingParametersConversion } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters-conversion";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import type { EmbeddingParameters } from "metabase/public/lib/types";
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
  const { convertToEmbedSettings, convertToEmbeddingParameters } =
    useEmbeddingParametersConversion();

  const hasInitializedRef = useRef(false);

  const areEmbeddingParametersInitialized =
    (!!settings.dashboardId || !!settings.questionId) &&
    (("hiddenParameters" in settings && !!settings.hiddenParameters) ||
      ("lockedParameters" in settings && !!settings.lockedParameters));

  const initialEmbeddingParameters = useMemo(() => {
    if (!resource || !initialAvailableParameters) {
      return null;
    }

    return getDefaultEmbeddingParams(resource, initialAvailableParameters, {
      getAllParams: true,
    });
  }, [initialAvailableParameters, resource]);

  const embeddingParameters = useMemo(() => {
    const hiddenParameters =
      "hiddenParameters" in settings ? settings.hiddenParameters : undefined;
    const lockedParameters =
      "lockedParameters" in settings ? settings.lockedParameters : undefined;

    return convertToEmbeddingParameters(
      availableParameters,
      hiddenParameters,
      lockedParameters,
    );
  }, [availableParameters, convertToEmbeddingParameters, settings]);

  const onEmbeddingParametersChange = useCallback(
    (embeddingParameters: EmbeddingParameters) => {
      updateSettings(convertToEmbedSettings(embeddingParameters));
    },
    [convertToEmbedSettings, updateSettings],
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
