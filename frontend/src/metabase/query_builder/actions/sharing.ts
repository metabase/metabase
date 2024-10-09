import { createAsyncThunk } from "@reduxjs/toolkit";

import { createCardPublicLink, deleteCardPublicLink } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { CardApi } from "metabase/services";
import type { Card, CardId } from "metabase-types/api";

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
  (card: Card) => async dispatch =>
    await dispatch(deleteCardPublicLink.initiate(card)),
);

export const updateEnableEmbedding = createAsyncThunk<
  Pick<Card, "id" | "enable_embedding"> & { uuid: Card["public_uuid"] },
  Pick<Card, "id" | "enable_embedding">
>("metabase/card/UPDATE_ENABLE_EMBEDDING", async ({ id, enable_embedding }) => {
  const response = await CardApi.update({
    id,
    enable_embedding,
  });

  return { id, uuid: response.uuid, enable_embedding };
});

export const updateEmbeddingParams = createAsyncThunk<
  Card,
  { id: CardId; embedding_params: EmbeddingParameters }
>(
  "metabase/card/UPDATE_EMBEDDING_PARAMS",
  async ({ id, embedding_params }) =>
    await CardApi.update({ id, embedding_params }),
);
