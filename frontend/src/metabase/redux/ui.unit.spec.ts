import { configureStore } from "@reduxjs/toolkit";

import { closeModal, modal, setOpenModal, setOpenModalWithProps } from "./ui";

jest.mock("metabase/env", () => ({
  isProduction: false,
}));

describe("metabase/redux/ui", () => {
  const createMockStore = () => {
    return configureStore({
      reducer: { modal },
    });
  };

  describe("setOpenModal", () => {
    it("should set the modal id and clear props", () => {
      const store = createMockStore();

      store.dispatch(setOpenModal("dashboard"));

      expect(store.getState().modal).toEqual({
        id: "dashboard",
        props: null,
      });
    });
  });

  describe("closeModal", () => {
    it("should clear the modal state", () => {
      const store = createMockStore();

      store.dispatch(setOpenModal("dashboard"));
      store.dispatch(closeModal());

      expect(store.getState().modal).toEqual({
        id: null,
        props: null,
      });
    });
  });

  describe("setOpenModalWithProps", () => {
    it("should set the modal id and props", () => {
      const store = createMockStore();
      const props = { dashboardId: 123, title: "My Dashboard" };

      store.dispatch(setOpenModalWithProps({ id: "dashboard", props }));

      expect(store.getState().modal).toEqual({
        id: "dashboard",
        props,
      });
    });

    it("should handle null props", () => {
      const store = createMockStore();

      store.dispatch(setOpenModalWithProps({ id: "dashboard", props: null }));

      expect(store.getState().modal).toEqual({
        id: "dashboard",
        props: null,
      });
    });

    it("should handle undefined props", () => {
      const store = createMockStore();

      store.dispatch(setOpenModalWithProps({ id: "dashboard" }));

      expect(store.getState().modal).toEqual({
        id: "dashboard",
        props: null,
      });
    });

    describe("validation", () => {
      it("should throw an error when props contain non-serializable values in development", () => {
        const store = createMockStore();
        const props = { callback: () => {} };

        expect(() => {
          store.dispatch(setOpenModalWithProps({ id: "dashboard", props }));
        }).toThrow("Modal props must be serializable");
      });

      it("should not throw an error when props contain non-serializable values in production", () => {
        jest.resetModules();
        jest.doMock("metabase/env", () => ({
          isProduction: true,
        }));

        /* eslint-disable @typescript-eslint/no-require-imports -- require after jest.doMock */
        const { configureStore } = require("@reduxjs/toolkit");
        const {
          modal: productionModal,
          setOpenModalWithProps: productionSetOpenModalWithProps,
        } = require("./ui");
        /* eslint-enable @typescript-eslint/no-require-imports */

        const store = configureStore({
          reducer: { modal: productionModal },
        });

        const props = { callback: () => {} };

        expect(() => {
          store.dispatch(
            productionSetOpenModalWithProps({ id: "dashboard", props }),
          );
        }).not.toThrow();
      });
    });
  });
});
