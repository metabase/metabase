import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { isProduction } from "metabase/env";
import { isSerializable } from "metabase/lib/objects";
import type { ModalState } from "metabase-types/store/modal";

type SetOpenModalPayload = ModalState["id"];
/**
 * This makes all `props` property optional while maintaining discriminated union types.
 *
 * This is necessary because `props` can never be undefined in the store, but can be
 * omitted in the actions.
 */
type SetOpenModalWithPropsPayload = ModalState extends infer U
  ? U extends { id: infer ID; props: infer P }
    ? { id: ID; props?: P }
    : never
  : never;

/**
 * Validates that modal props are serializable.
 * Throws an error in development if non-serializable values are detected.
 */
function validateSerializableProps(props: unknown): void {
  if (isProduction || !props) {
    return;
  }

  if (isSerializable(props)) {
    return;
  }

  console.error("Non-serializable modal props detected:", props);
  throw new Error(
    "Modal props must be serializable. Avoid passing functions, class instances, or other non-serializable values.",
  );
}

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
      validateSerializableProps(action.payload.props);

      state.id = action.payload.id;
      state.props = action.payload.props ?? null;
    },
    closeModal: (state) => {
      state.id = DEFAULT_MODAL_STATE.id;
      state.props = DEFAULT_MODAL_STATE.props;
    },
  },
});

export const modal = modalSlice.reducer;

export const { setOpenModal, closeModal, setOpenModalWithProps } =
  modalSlice.actions;
