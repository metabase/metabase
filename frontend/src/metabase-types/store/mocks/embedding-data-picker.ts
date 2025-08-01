import type { EmbeddingDataPickerState } from "../embedding-data-picker";

export const createMockEmbeddingDataPickerState = (
  opts?: Partial<EmbeddingDataPickerState>,
): EmbeddingDataPickerState => ({
  // Entity types are derived at runtime depending on number of models present.
  entityTypes: [],
  ...opts,
});
