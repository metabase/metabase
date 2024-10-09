import { createCardPublicLink, deleteCardPublicLink } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";
import type { Card } from "metabase-types/api";

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
