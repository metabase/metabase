import { createReducer } from "@reduxjs/toolkit";

import { createAction } from "metabase/lib/redux";

export type NewModalKeys = "dashboard" | "collection" | "action";

export const SET_OPEN_MODAL = "metabase/ui/SET_OPEN_MODAL";
export const CLOSE_MODAL = "metabase/ui/CLOSE_MODAL";

export const setOpenModal = createAction<NewModalKeys>(SET_OPEN_MODAL);
export const closeModal = createAction(CLOSE_MODAL);

export const modal = createReducer<NewModalKeys | null>(null, builder => {
  builder
    .addCase(setOpenModal, (state, { payload }) => payload)
    .addCase(closeModal, () => null);
});
