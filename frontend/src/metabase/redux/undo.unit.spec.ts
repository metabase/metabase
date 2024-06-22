import { configureStore } from "@reduxjs/toolkit";
import { act } from "@testing-library/react";

import type { Dispatch } from "metabase-types/store";

import {
  undoReducer,
  addUndo,
  dismissAllUndo,
  dismissUndo,
  pauseUndo,
  performUndo,
  resumeUndo,
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

      await store.dispatch(dismissUndo({ undoId: MOCK_ID }));

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

  it("should handle pause and resume", async () => {
    const store = createMockStore();
    const timeout = 1000;
    const timeShiftBeforePause = timeout - 150;
    const timeShiftDuringPause = timeout + 100;
    const timeShiftResumed1 = 100;
    const timeShiftResumed2 = 100;

    store.dispatch(addUndo({ id: MOCK_ID, timeout }));

    // await act is required to simulate store update on the next tick
    await act(async () => {
      jest.advanceTimersByTime(timeShiftBeforePause);
    });

    // pause undo (e.g. when mouse is over toast)
    store.dispatch(pauseUndo(store.getState().undo[0]));

    await act(async () => {
      jest.advanceTimersByTime(timeShiftDuringPause);
    });

    // undo is there
    expect(store.getState().undo.length).toBe(1);

    // resume undo (e.g. when mouse left toast)
    store.dispatch(resumeUndo(store.getState().undo[0]));

    await act(async () => {
      jest.advanceTimersByTime(timeShiftResumed1);
    });

    // undo is still there, timeout didn't pass
    expect(store.getState().undo.length).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(timeShiftResumed2);
    });

    // undo is dismissed, timeout passed
    expect(store.getState().undo.length).toBe(0);
  });

  it("should hide toast after timeout is passed", async () => {
    const store = createMockStore();
    const timeout = 1000;

    store.dispatch(addUndo({ id: MOCK_ID, timeout }));

    // await act is required to simulate store update on the next tick
    await act(async () => {
      jest.advanceTimersByTime(timeout - 100);
    });

    // verify undo is there
    expect(store.getState().undo.length).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // verify undo is dismissed
    expect(store.getState().undo.length).toBe(0);
  });
});

const createMockStore = () => {
  const store = configureStore({
    // @ts-expect-error rework undo reducer to RTK
    reducer: { undo: undoReducer },
  });
  return store as typeof store & { dispatch: Dispatch };
};
