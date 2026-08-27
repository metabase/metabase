import { act, renderHook } from "@testing-library/react";

import { usePrintContextValue } from "./use-print-context-value";

describe("usePrintContextValue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Modern fake timers fake requestAnimationFrame, which jsdom schedules ~16ms
  // apart, so advancing by one frame runs a single pending rAF callback.
  async function advanceFrame() {
    await act(() => jest.advanceTimersByTimeAsync(16));
  }

  it("sets and clears printing state from browser print events", () => {
    const { result } = renderHook(() => usePrintContextValue());

    expect(result.current.isPrinting).toBe(false);

    act(() => window.dispatchEvent(new Event("beforeprint")));
    expect(result.current.isPrinting).toBe(true);

    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(result.current.isPrinting).toBe(false);
  });

  it("sets printing state and waits two animation frames before resolving", async () => {
    const { result } = renderHook(() => usePrintContextValue());
    let resolved = false;
    let promise: Promise<void> | undefined;

    act(() => {
      promise = result.current.prepareForPrint().then(() => {
        resolved = true;
      });
    });

    expect(result.current.isPrinting).toBe(true);
    expect(resolved).toBe(false);

    await advanceFrame();
    expect(resolved).toBe(false);

    await advanceFrame();
    await promise;
    expect(resolved).toBe(true);
  });

  it("waits until the optional readiness predicate passes", async () => {
    let ready = false;
    const isReady = jest.fn(() => ready);
    const { result } = renderHook(() => usePrintContextValue({ isReady }));
    let resolved = false;
    let promise: Promise<void> | undefined;

    act(() => {
      promise = result.current.prepareForPrint().then(() => {
        resolved = true;
      });
    });

    await advanceFrame();
    await advanceFrame();

    expect(isReady).toHaveBeenCalled();
    expect(resolved).toBe(false);

    ready = true;
    await act(async () => {
      jest.advanceTimersByTime(100);
      await promise;
    });

    expect(resolved).toBe(true);
  });

  it("stops waiting when the readiness timeout expires", async () => {
    const isReady = jest.fn(() => false);
    const { result } = renderHook(() => usePrintContextValue({ isReady }));
    let resolved = false;
    let promise: Promise<void> | undefined;

    act(() => {
      promise = result.current.prepareForPrint().then(() => {
        resolved = true;
      });
    });

    await advanceFrame();
    await advanceFrame();
    expect(resolved).toBe(false);

    await act(async () => {
      // Push the faked clock past the 15s readiness deadline; the next poll
      // tick then exits the wait loop even though isReady still returns false.
      jest.advanceTimersByTime(16_000);
      await promise;
    });

    expect(resolved).toBe(true);
  });
});
