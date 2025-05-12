import type {
  EmbedState,
  InteractiveEmbeddingOptions,
} from "metabase-types/store";

export const createMockEmbedOptions = (
  opts?: Partial<InteractiveEmbeddingOptions>,
) => ({
  ...opts,
});

export const createMockEmbedState = (
  opts?: Partial<EmbedState>,
): EmbedState => ({
  options: createMockEmbedOptions(),
  isEmbeddingSdk: false,
  ...opts,
});
