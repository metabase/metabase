import { createAction } from "@reduxjs/toolkit";
import type { CardId } from "metabase-types/api";

const SET_OUTSIDE_DRAGGED_CARD_ID =
  "metabase/dashboard/SET_OUTSIDE_DRAGGED_CARD_ID";

export const setOutsideDraggedCardId = createAction<CardId | null>(
  SET_OUTSIDE_DRAGGED_CARD_ID,
);
