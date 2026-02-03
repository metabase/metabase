import { useCallback } from "react";

import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Parameter } from "metabase-types/api";

export const useEmbeddingParametersConversion = () => {
  const convertToEmbedSettings = useCallback(
    (
      embeddingParameters: EmbeddingParameters,
    ): Partial<SdkIframeEmbedSetupSettings> => {
      const { hiddenParameters, lockedParameters } = Object.entries(
        embeddingParameters,
      ).reduce(
        (acc, [slug, state]) => {
          if (state === "locked") {
            acc.lockedParameters.push(slug);
          }

          if (state === "disabled") {
            acc.hiddenParameters.push(slug);
          }

          return acc;
        },
        {
          hiddenParameters: [] as string[],
          lockedParameters: [] as string[],
        },
      );

      return {
        hiddenParameters,
        lockedParameters,
      };
    },
    [],
  );

  const convertToEmbeddingParameters = useCallback(
    (
      parameters: Parameter[],
      hiddenParameters: string[] = [],
      lockedParameters: string[] = [],
    ): EmbeddingParameters => {
      return parameters.reduce<EmbeddingParameters>((acc, { slug }) => {
        if (lockedParameters.includes(slug)) {
          acc[slug] = "locked";
        } else if (hiddenParameters.includes(slug)) {
          acc[slug] = "disabled";
        } else {
          acc[slug] = "enabled";
        }
        return acc;
      }, {});
    },
    [],
  );

  return {
    convertToEmbedSettings,
    convertToEmbeddingParameters,
  };
};
