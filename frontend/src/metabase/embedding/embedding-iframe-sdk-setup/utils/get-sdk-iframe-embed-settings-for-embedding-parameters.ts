import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { EmbeddingParameters } from "metabase/public/lib/types";

export const getSdkIframeEmbedSettingsForEmbeddingParameters = (
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
};
