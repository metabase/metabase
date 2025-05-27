import type { EmbeddingEntityType } from "metabase/embedding-sdk/store";
import type { State } from "metabase-types/store";

export const getEntityTypes = (state: State): EmbeddingEntityType[] => {
  return state.embeddingDataPicker.entityTypes;
};
