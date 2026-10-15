import { act, renderHook } from "@testing-library/react";

import { useHasPaintedSinceMount } from "./use-has-painted-since-mount";

describe("useHasPaintedSinceMount", () => {
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  const runFrame = () => {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    act(() => callbacks.forEach((callback) => callback(performance.now())));
  };

  beforeEach(() => {
    frameCallbacks = new Map();
    nextFrameId = 1;
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const frameId = nextFrameId++;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    jest
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((frameId) => frameCallbacks.delete(frameId));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is false on mount", () => {
    const { result } = renderHook(() => useHasPaintedSinceMount());
    expect(result.current).toBe(false);
  });

  it("stays false after only one frame, because that frame has not been painted yet", () => {
    const { result } = renderHook(() => useHasPaintedSinceMount());
    runFrame();
    expect(result.current).toBe(false);
  });

  it("becomes true on the second frame", () => {
    const { result } = renderHook(() => useHasPaintedSinceMount());
    runFrame();
    runFrame();
    expect(result.current).toBe(true);
  });

  it.each([
    ["before the first frame", 0],
    ["between the two frames", 1],
  ])("cancels the pending frame when unmounted %s", (_label, framesRun) => {
    const { unmount } = renderHook(() => useHasPaintedSinceMount());
    for (let i = 0; i < framesRun; i++) {
      runFrame();
    }
    unmount();
    expect(frameCallbacks.size).toBe(0);
  });
});
