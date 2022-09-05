import { createAction } from "redux-actions";
import { CardApi } from "metabase/services";

export const CREATE_PUBLIC_LINK = "metabase/card/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(CREATE_PUBLIC_LINK, ({ id }) =>
  CardApi.createPublicLink({ id }),
);

export const DELETE_PUBLIC_LINK = "metabase/card/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(DELETE_PUBLIC_LINK, ({ id }) =>
  CardApi.deletePublicLink({ id }),
);

export const UPDATE_ENABLE_EMBEDDING = "metabase/card/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }, enable_embedding) => CardApi.update({ id, enable_embedding }),
);

export const UPDATE_EMBEDDING_PARAMS = "metabase/card/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }, embedding_params) => CardApi.update({ id, embedding_params }),
);
