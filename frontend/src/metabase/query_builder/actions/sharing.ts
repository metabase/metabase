import { createAction } from "redux-actions";

import { createCardPublicLink, deleteCardPublicLink } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import type { Card, GetPublicOrEmbeddableCard } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";

type CardIdPayload = Pick<Card, "id">;

export const CREATE_PUBLIC_LINK = "metabase/card/CREATE_PUBLIC_LINK";

export const createPublicLink = createThunkAction(
  CREATE_PUBLIC_LINK,
  ({ id }: Card) =>
    async dispatch => {
      const { data } = await (dispatch(
        createCardPublicLink.initiate({ id }),
      ) as Promise<{ data: { uuid: string }; error: unknown }>);
      return { id, uuid: data.uuid };
    },
);

export const DELETE_PUBLIC_LINK = "metabase/card/DELETE_PUBLIC_LINK";

export const deletePublicLink = createThunkAction(
  DELETE_PUBLIC_LINK,
  (card: GetPublicOrEmbeddableCard) => async dispatch =>
    await dispatch(deleteCardPublicLink.initiate(card)),
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
