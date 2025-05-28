import {
  DEFAULT_EMBEDDING_ENTITY_TYPES,
  type EmbeddingDataPickerState,
} from "../embedding-data-picker";

export const createMockEmbeddingDataPickerState = (
  opts?: Partial<EmbeddingDataPickerState>,
): EmbeddingDataPickerState => ({
  entityTypes: DEFAULT_EMBEDDING_ENTITY_TYPES,
  ...opts,
});
