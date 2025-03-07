import { DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS } from "metabase/redux/embed";
import type {
  EmbedState,
  InteractiveEmbeddingOptions,
} from "metabase-types/store";

export const createMockEmbedOptions = (
  opts?: Partial<InteractiveEmbeddingOptions>,
) => ({
  ...DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
  ...opts,
});

export const createMockEmbedState = (
  opts?: Partial<EmbedState>,
): EmbedState => ({
  options: createMockEmbedOptions(),
  isEmbeddingSdk: false,
  ...opts,
});
