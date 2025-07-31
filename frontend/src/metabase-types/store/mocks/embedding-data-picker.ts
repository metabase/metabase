import type { EmbeddingDataPickerState } from "../embedding-data-picker";

export const createMockEmbeddingDataPickerState = (
  opts?: Partial<EmbeddingDataPickerState>,
): EmbeddingDataPickerState => ({
  entityTypes: [],
  ...opts,
});
