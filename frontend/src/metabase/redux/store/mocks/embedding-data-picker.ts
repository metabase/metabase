import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/redux/embedding-data-picker";

import type { EmbeddingDataPickerState } from "../embedding-data-picker";

export const createMockEmbeddingDataPickerState = (
  opts?: Partial<EmbeddingDataPickerState>,
): EmbeddingDataPickerState => ({
  entityTypes: DEFAULT_EMBEDDING_ENTITY_TYPES,
  dataPicker: "flat",
  ...opts,
});
