import { act, renderHook } from "@testing-library/react";

import { useSmoothText } from "./useSmoothText";

describe("useSmoothText", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the target verbatim when disabled", () => {
    const { result } = renderHook(() =>
      useSmoothText("the whole message", false),
    );
    expect(result.current).toBe("the whole message");
  });

  it("starts empty and reveals text gradually, ending at word boundaries", () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ target }) => useSmoothText(target, true),
      { initialProps: { target: "start" } },
    );

    // when animating, nothing is shown until frames advance (no initial dump)
    expect(result.current).toBe("");

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe("start");

    // a burst of new text arrives at once
    const full = "start of a much longer streamed sentence here";
    rerender({ target: full });

    // after a single frame it should have revealed *some* but not all
    act(() => {
      jest.advanceTimersByTime(16);
    });
    expect(result.current.length).toBeGreaterThan("start".length);
    expect(result.current.length).toBeLessThan(full.length);
    // never reveals a partial word
    expect(full.startsWith(result.current)).toBe(true);
    const nextChar = full[result.current.length];
    expect(nextChar === undefined || /\s/.test(nextChar)).toBe(true);

    // after enough frames it catches up entirely
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(full);
  });

  it("snaps to the full target when streaming ends", () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ target, enabled }) => useSmoothText(target, enabled),
      { initialProps: { target: "a", enabled: true } },
    );

    rerender({ target: "a much longer final message", enabled: false });
    expect(result.current).toBe("a much longer final message");
  });
});
