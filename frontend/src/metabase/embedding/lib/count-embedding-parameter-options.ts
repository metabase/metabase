import type {
  EmbeddingParameterVisibility,
  EmbeddingParameters,
} from "metabase/public/lib/types";

export const countEmbeddingParameterOptions = (
  embeddingParams: EmbeddingParameters,
): Record<EmbeddingParameterVisibility, number> =>
  Object.values(embeddingParams).reduce(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    { disabled: 0, locked: 0, enabled: 0 } as Record<
      EmbeddingParameterVisibility,
      number
    >,
  );
