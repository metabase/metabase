import { createAction, handleActions } from "metabase/lib/redux";

export const SET_OPEN_MODAL = "metabase/ui/SET_OPEN_MODAL";
export const CLOSE_MODAL = "metabase/ui/CLOSE_MODAL";

export const setOpenModal = createAction(SET_OPEN_MODAL);
export const closeModal = createAction(CLOSE_MODAL);

export const modal = handleActions(
  {
    [SET_OPEN_MODAL]: (state, { payload }) => payload,
    [CLOSE_MODAL]: () => null,
  },
  null,
);
