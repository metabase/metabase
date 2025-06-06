import type { State } from "metabase-types/store";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

export const getEntityTypes = (state: State): EmbeddingEntityType[] => {
  return state.embeddingDataPicker.entityTypes;
};
