import { renderHook } from "@testing-library/react";

import {
  type ComponentSignal,
  getFirstSignal,
  onFirstSignal,
  reportComponentError,
  reportComponentReady,
  resetComponentSignals,
  useReportComponentReady,
} from "./component-signals";

describe("component-signals store", () => {
  beforeEach(() => {
    resetComponentSignals();
  });

  describe("reportComponentReady", () => {
    it("records the first ready signal", () => {
      reportComponentReady("StaticDashboard");

      const signal = getFirstSignal();
      expect(signal).not.toBeNull();
      expect(signal?.component).toBe("StaticDashboard");
      expect(signal?.status).toBe("ready");
      expect(signal?.timestamp).toBeGreaterThan(0);
      expect(signal?.errorType).toBeUndefined();
    });

    it("ignores subsequent signals after the first", () => {
      reportComponentReady("StaticDashboard");
      reportComponentReady("StaticQuestion");

      const signal = getFirstSignal();
      expect(signal?.component).toBe("StaticDashboard");
    });

    it("ignores error signals after a ready signal", () => {
      reportComponentReady("StaticDashboard");
      reportComponentError("StaticQuestion", "query_error");

      const signal = getFirstSignal();
      expect(signal?.status).toBe("ready");
      expect(signal?.component).toBe("StaticDashboard");
    });
  });

  describe("reportComponentError", () => {
    it("records the first error signal", () => {
      reportComponentError("CollectionBrowser", "load_error");

      const signal = getFirstSignal();
      expect(signal).not.toBeNull();
      expect(signal?.component).toBe("CollectionBrowser");
      expect(signal?.status).toBe("error");
      expect(signal?.errorType).toBe("load_error");
      expect(signal?.timestamp).toBeGreaterThan(0);
    });

    it("ignores ready signals after an error signal", () => {
      reportComponentError("CollectionBrowser", "load_error");
      reportComponentReady("StaticDashboard");

      const signal = getFirstSignal();
      expect(signal?.status).toBe("error");
      expect(signal?.component).toBe("CollectionBrowser");
    });
  });

  describe("onFirstSignal", () => {
    it("fires the callback when a signal is emitted", () => {
      const callback = jest.fn();
      onFirstSignal(callback);

      reportComponentReady("InteractiveDashboard");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          component: "InteractiveDashboard",
          status: "ready",
        }),
      );
    });

    it("fires synchronously when a signal was already recorded", () => {
      reportComponentReady("StaticQuestion");

      const callback = jest.fn();
      onFirstSignal(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          component: "StaticQuestion",
          status: "ready",
        }),
      );
    });

    it("fires the callback only once even with multiple signals", () => {
      const callback = jest.fn();
      onFirstSignal(callback);

      reportComponentReady("StaticDashboard");
      reportComponentReady("InteractiveDashboard");

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("returns an unsubscribe function that prevents the callback", () => {
      const callback = jest.fn();
      const unsubscribe = onFirstSignal(callback);

      unsubscribe();
      reportComponentReady("StaticDashboard");

      expect(callback).not.toHaveBeenCalled();
    });

    it("supports multiple subscribers", () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();
      onFirstSignal(callbackA);
      onFirstSignal(callbackB);

      reportComponentReady("EditableDashboard");

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });
  });

  describe("getFirstSignal", () => {
    it("returns null when no signal was recorded", () => {
      expect(getFirstSignal()).toBeNull();
    });

    it("returns the signal after one was recorded", () => {
      reportComponentReady("MetabotQuestion");
      expect(getFirstSignal()).not.toBeNull();
    });
  });
});

describe("useReportComponentReady hook", () => {
  let emittedSignal: ComponentSignal | null;

  beforeEach(() => {
    resetComponentSignals();
    emittedSignal = null;
    onFirstSignal((signal) => {
      emittedSignal = signal;
    });
  });

  it("reports ready when isReady becomes true", () => {
    renderHook(() =>
      useReportComponentReady({
        component: "StaticQuestion",
        isReady: true,
      }),
    );

    expect(emittedSignal).not.toBeNull();
    expect(emittedSignal?.component).toBe("StaticQuestion");
    expect(emittedSignal?.status).toBe("ready");
  });

  it("does not report when isReady is false", () => {
    renderHook(() =>
      useReportComponentReady({
        component: "StaticQuestion",
        isReady: false,
      }),
    );

    expect(emittedSignal).toBeNull();
  });

  it("reports error when isError is true with an errorType", () => {
    renderHook(() =>
      useReportComponentReady({
        component: "CollectionBrowser",
        isReady: false,
        isError: true,
        errorType: "load_error",
      }),
    );

    expect(emittedSignal).not.toBeNull();
    expect(emittedSignal?.status).toBe("error");
    expect(emittedSignal?.errorType).toBe("load_error");
  });

  it("fires only once even after re-renders", () => {
    const callback = jest.fn();
    resetComponentSignals();
    onFirstSignal(callback);

    const { rerender } = renderHook(
      ({ isReady }: { isReady: boolean }) =>
        useReportComponentReady({
          component: "StaticDashboard",
          isReady,
        }),
      { initialProps: { isReady: false } },
    );

    expect(callback).not.toHaveBeenCalled();

    rerender({ isReady: true });
    expect(callback).toHaveBeenCalledTimes(1);

    rerender({ isReady: true });
    // The hook's internal ref prevents double-firing.
    // The store also deduplicates, but only one signal should reach it.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires once when transitioning from loading to ready", () => {
    const callback = jest.fn();
    resetComponentSignals();
    onFirstSignal(callback);

    const { rerender } = renderHook(
      ({ isReady }: { isReady: boolean }) =>
        useReportComponentReady({
          component: "InteractiveQuestion",
          isReady,
        }),
      { initialProps: { isReady: false } },
    );

    expect(callback).not.toHaveBeenCalled();

    rerender({ isReady: true });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        component: "InteractiveQuestion",
        status: "ready",
      }),
    );
  });

  it("prefers error over ready when both are true", () => {
    renderHook(() =>
      useReportComponentReady({
        component: "StaticDashboard",
        isReady: true,
        isError: true,
        errorType: "auth_error",
      }),
    );

    expect(emittedSignal?.status).toBe("error");
    expect(emittedSignal?.errorType).toBe("auth_error");
  });
});
