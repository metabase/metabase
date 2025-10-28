import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { ModalState } from "metabase-types/store/modal";

type SetOpenModalPayload = ModalState["id"];
type SetOpenModalWithPropsPayload = {
  id: ModalState["id"];
  props: ModalState["props"];
};

const DEFAULT_MODAL_STATE: ModalState = {
  id: null,
  props: null,
};

const modalSlice = createSlice({
  name: "modal",
  initialState: DEFAULT_MODAL_STATE,
  reducers: {
    setOpenModal: (state, action: PayloadAction<SetOpenModalPayload>) => {
      state.id = action.payload;
      state.props = null;
    },
    setOpenModalWithProps: (
      state,
      action: PayloadAction<SetOpenModalWithPropsPayload>,
    ) => {
      state.id = action.payload.id;
      state.props = action.payload.props;
    },
    closeModal: (state) => {
      state.id = DEFAULT_MODAL_STATE.id;
      state.props = DEFAULT_MODAL_STATE.props;
    },
  },
});

export const modal = modalSlice.reducer;

export const { setOpenModal, setOpenModalWithProps, closeModal } =
  modalSlice.actions;
