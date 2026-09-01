import { type PayloadAction, createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import {
  closeModal,
  setOpenModal,
  setOpenModalWithProps,
} from "metabase/redux/ui";

import type {
  LegacyStaticEmbeddingModalProps,
  SdkIframeEmbedSetupModalInitialState,
} from "./types";

export type EmbedSetupModalState =
  | { modal: null }
  | {
      modal: "embed-js-wizard";
      initialState?: SdkIframeEmbedSetupModalInitialState;
    }
  | {
      modal: "legacy-static-embedding";
      props: LegacyStaticEmbeddingModalProps;
    };

const CLOSED_MODAL_STATE: EmbedSetupModalState = { modal: null };

const embedSetupModalSlice = createSlice({
  name: "embedSetupModal",
  initialState: (): EmbedSetupModalState => CLOSED_MODAL_STATE,
  reducers: {
    openEmbedJsWizard: (
      _state,
      action: PayloadAction<SdkIframeEmbedSetupModalInitialState | undefined>,
    ) => ({
      modal: "embed-js-wizard" as const,
      initialState: action.payload,
    }),
    openLegacyStaticEmbeddingModal: (
      _state,
      action: PayloadAction<LegacyStaticEmbeddingModalProps>,
    ) => ({
      modal: "legacy-static-embedding" as const,
      props: action.payload,
    }),
    closeEmbedSetupModal: () => CLOSED_MODAL_STATE,
  },
  extraReducers: (builder) => {
    // Any open or close of the shared modal slice also closes these modals.
    // Otherwise a palette or shortcut modal would open on top of the wizard.
    builder.addMatcher(
      isAnyOf(setOpenModal, setOpenModalWithProps, closeModal),
      () => CLOSED_MODAL_STATE,
    );
  },
});

export const embedSetupModalReducer = embedSetupModalSlice.reducer;

export const {
  openEmbedJsWizard,
  openLegacyStaticEmbeddingModal,
  closeEmbedSetupModal,
} = embedSetupModalSlice.actions;

// The reducer is registered by the main app's store root only, so the key is optional on the global state.
export interface EmbedSetupModalStoreState extends State {
  embedSetupModal?: EmbedSetupModalState;
}

export const getEmbedSetupModal = (
  state: EmbedSetupModalStoreState,
): EmbedSetupModalState => state.embedSetupModal ?? CLOSED_MODAL_STATE;
