import { useCallback, useMemo, useRef } from "react";

import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useParameterVisibility } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-parameter-visibility";
import { getSdkIframeEmbedSettingsForEmbeddingParameters } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-sdk-iframe-embed-settings-for-embedding-parameters";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

interface UseEmbeddingParametersProps
  extends Pick<SdkIframeEmbedSetupContextType, "settings" | "updateSettings"> {
  resource: Dashboard | Card | null;
  availableParameters: Parameter[];
}

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

/**
 * Manages embedding parameters state (locked/disabled/enabled).
 * Provides both current state and initial defaults from the resource.
 */
export const useEmbeddingParameters = ({
  settings,
  updateSettings,
  resource,
  availableParameters,
}: UseEmbeddingParametersProps) => {
  const { isHiddenParameter, isLockedParameter } = useParameterVisibility({
    settings,
    updateSettings,
  });

  const initialEmbeddingParametersRef = useRef<EmbeddingParameters | null>(
    null,
  );

  // Compute initial embedding parameters only once when resource first loads
  if (resource && !initialEmbeddingParametersRef.current) {
    initialEmbeddingParametersRef.current = getDefaultEmbeddingParams(
      resource,
      availableParameters,
      { getAllParams: true },
    );
  }

  // Clear initial parameters when resource changes
  const resourceIdRef = useRef<number | string | null>(null);
  const currentResourceId = resource?.id ?? null;

  if (currentResourceId !== resourceIdRef.current) {
    resourceIdRef.current = currentResourceId;
    initialEmbeddingParametersRef.current = null;
  }

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

  return {
    initialEmbeddingParameters: initialEmbeddingParametersRef.current,
    embeddingParameters,
    onEmbeddingParametersChange,
  };
};
