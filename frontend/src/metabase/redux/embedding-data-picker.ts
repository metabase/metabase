import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import _ from "underscore";

import type {
  EmbeddingDataPickerState,
  EmbeddingEntityType,
} from "metabase-types/store/embedding-data-picker";

export const DEFAULT_EMBEDDING_ENTITY_TYPES: EmbeddingEntityType[] = [
  "model",
  "table",
];

export const DEFAULT_EMBEDDING_DATA_PICKER_STATE: EmbeddingDataPickerState = {
  entityTypes: DEFAULT_EMBEDDING_ENTITY_TYPES,
  dataPicker: "flat",
};

const embeddingDataPickerSlice = createSlice({
  name: "embeddingDataPicker",
  initialState: DEFAULT_EMBEDDING_DATA_PICKER_STATE,
  reducers: {
    setEntityTypes: (
      state,
      action: PayloadAction<EmbeddingEntityType[] | undefined>,
    ) => {
      if (action.payload) {
        const entityTypes = normalizeEntityTypes(action.payload);
        if (!_.isEqual(state.entityTypes, entityTypes)) {
          state.entityTypes = entityTypes;
        }
      }
    },
  },
});

/**
 * this function is key to ensure that we won't end up with invalid `entityTypes` values.
 * As it could not be empty, it needs at least a single valid value. e.g. `["model"]`, or `["model", "table"]`,
 * but never `[]`.
 */
function normalizeEntityTypes(
  entityTypes: EmbeddingEntityType[],
): EmbeddingEntityType[] {
  const ALLOWED_ENTITY_TYPES: EmbeddingEntityType[] = [
    "model",
    "table",
    "question",
  ];

  const filteredEntityTypes = entityTypes.filter((type) =>
    ALLOWED_ENTITY_TYPES.includes(type),
  );

  if (filteredEntityTypes.length === 0) {
    return DEFAULT_EMBEDDING_ENTITY_TYPES;
  }

  return filteredEntityTypes;
}

export const { setEntityTypes } = embeddingDataPickerSlice.actions;

export const { reducer } = embeddingDataPickerSlice;
