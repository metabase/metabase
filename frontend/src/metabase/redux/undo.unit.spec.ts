import { configureStore } from "@reduxjs/toolkit";

import type { Dispatch } from "metabase-types/store";

import undoReducer, {
  addUndo,
  dismissAllUndo,
  dismissUndo,
  performUndo,
} from "./undo";

const MOCK_ID = "123";

describe("metabase/redux/undo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  describe("addUndo", () => {
    it("should call clearTimeout if adding two undos with the same id", async () => {
      const store = createMockStore();

      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      await store.dispatch(addUndo({ id: MOCK_ID }));

      await store.dispatch(addUndo({ id: "456" }));

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(0);

      store.dispatch(addUndo({ id: MOCK_ID }));

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("performUndo", () => {
    it("should call undo.action and reset timeout", async () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      const action = jest.fn();
      const store = createMockStore();

      await store.dispatch(addUndo({ id: MOCK_ID, action }));

      await store.dispatch(performUndo(MOCK_ID));

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe("dismissUndo", () => {
    it("should clear timeout when dismissing", async () => {
      const store = createMockStore();

      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      await store.dispatch(addUndo({ id: MOCK_ID }));

      await store.dispatch(dismissUndo(MOCK_ID));

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dismissAllUndo", () => {
    it("should clear timeout when dismissing all undoes", async () => {
      const store = createMockStore();

      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      await store.dispatch(addUndo({ id: MOCK_ID }));

      store.dispatch(dismissAllUndo());

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });
  });
});

const createMockStore = () => {
  const store = configureStore({
    // @ts-expect-error undo is still not converted to TS
    reducer: { undo: undoReducer },
  });
  return store as typeof store & { dispatch: Dispatch };
};
