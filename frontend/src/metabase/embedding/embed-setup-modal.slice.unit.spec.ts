import { configureStore } from "@reduxjs/toolkit";

import { createMockState } from "metabase/redux/store/mocks";
import { modal, setOpenModal } from "metabase/redux/ui";

import {
  closeEmbedSetupModal,
  embedSetupModalReducer,
  getEmbedSetupModal,
  openEmbedJsWizard,
  openLegacyStaticEmbeddingModal,
} from "./embed-setup-modal.slice";
import type { LegacyStaticEmbeddingModalProps } from "./types";

const createMockStore = () => {
  return configureStore({
    reducer: { embedSetupModal: embedSetupModalReducer, modal },
  });
};

const LEGACY_STATIC_PROPS: LegacyStaticEmbeddingModalProps = {
  experience: "dashboard",
  dashboardId: 1,
  parentInitialState: { resourceId: 1, resourceType: "dashboard" },
};

describe("embedSetupModal slice", () => {
  it("starts closed", () => {
    const store = createMockStore();

    expect(store.getState().embedSetupModal).toEqual({ modal: null });
  });

  it("opens the embed js wizard with its initial state", () => {
    const store = createMockStore();

    store.dispatch(openEmbedJsWizard({ isGuest: true }));

    expect(store.getState().embedSetupModal).toEqual({
      modal: "embed-js-wizard",
      initialState: { isGuest: true },
    });
  });

  it("replaces the wizard with the legacy static embedding modal", () => {
    const store = createMockStore();

    store.dispatch(openEmbedJsWizard({}));
    store.dispatch(openLegacyStaticEmbeddingModal(LEGACY_STATIC_PROPS));

    expect(store.getState().embedSetupModal).toEqual({
      modal: "legacy-static-embedding",
      props: LEGACY_STATIC_PROPS,
    });
  });

  it("closes on closeEmbedSetupModal", () => {
    const store = createMockStore();

    store.dispatch(openEmbedJsWizard({}));
    store.dispatch(closeEmbedSetupModal());

    expect(store.getState().embedSetupModal).toEqual({ modal: null });
  });

  it("closes when one of the app's shared modals opens", () => {
    const store = createMockStore();

    store.dispatch(openEmbedJsWizard({}));
    store.dispatch(setOpenModal("collection"));

    expect(store.getState().embedSetupModal).toEqual({ modal: null });
  });

  describe("getEmbedSetupModal", () => {
    it("reads the slice", () => {
      const state = {
        ...createMockState(),
        embedSetupModal: embedSetupModalReducer(
          undefined,
          openEmbedJsWizard({ isGuest: false }),
        ),
      };

      expect(getEmbedSetupModal(state)).toEqual({
        modal: "embed-js-wizard",
        initialState: { isGuest: false },
      });
    });

    it("falls back to closed when the slice is not registered", () => {
      expect(getEmbedSetupModal(createMockState())).toEqual({ modal: null });
    });
  });
});
