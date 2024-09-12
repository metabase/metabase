import { Api } from "metabase/api/api";
import { listTag } from "metabase/api/tags";
import { createThunkAction } from "metabase/lib/redux";
import { softReloadCard } from "metabase/query_builder/actions";

import { removeReview, verifyItem } from "./service";

export const VERIFY_CARD = "metabase-enterprise/moderation/VERIFY_CARD";
export const verifyCard = createThunkAction(
  VERIFY_CARD,
  (cardId, text) => async (dispatch, getState) => {
    await verifyItem({
      itemId: cardId,
      itemType: "card",
      text,
    });

    dispatch(Api.util.invalidateTags([listTag("card")]));
    return dispatch(softReloadCard());
  },
);

export const REMOVE_CARD_REVIEW =
  "metabase-enterprise/moderation/REMOVE_CARD_REVIEW";
export const removeCardReview = createThunkAction(
  REMOVE_CARD_REVIEW,
  cardId => async (dispatch, getState) => {
    await removeReview({
      itemId: cardId,
      itemType: "card",
    });

    dispatch(Api.util.invalidateTags([listTag("card")]));
    return dispatch(softReloadCard());
  },
);
