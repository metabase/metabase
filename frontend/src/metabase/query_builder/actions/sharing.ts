import { createAction } from "redux-actions";

import { CardApi } from "metabase/services";
import type { Card, CardId } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";

type CardIdPayload = {
  id: CardId;
};

export const CREATE_PUBLIC_LINK = "metabase/card/CREATE_PUBLIC_LINK";

export const createPublicLink = createAction(
  CREATE_PUBLIC_LINK,
  ({
    id,
  }: Card): Promise<{
    id: CardId;
    uuid: Card["public_uuid"];
  }> => {
    return CardApi.createPublicLink({ id });
  },
);

export const DELETE_PUBLIC_LINK = "metabase/card/DELETE_PUBLIC_LINK";

export const deletePublicLink = createAction(
  DELETE_PUBLIC_LINK,
  ({ id }: CardIdPayload) => CardApi.deletePublicLink({ id }),
);

export const UPDATE_ENABLE_EMBEDDING = "metabase/card/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }: CardIdPayload, enable_embedding: boolean) =>
    CardApi.update({
      id,
      enable_embedding,
    }),
);

export const UPDATE_EMBEDDING_PARAMS = "metabase/card/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }: CardIdPayload, embedding_params: EmbedOptions) =>
    CardApi.update({ id, embedding_params }),
);
