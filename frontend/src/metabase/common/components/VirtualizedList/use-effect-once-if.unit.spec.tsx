import { renderHook } from "@testing-library/react";

import { useEffectOnceIf } from "./use-effect-once-if";

describe("useEffectOnceIf", () => {
  it("should not call effect when condition is false", () => {
    const effect = jest.fn();

    renderHook(() => useEffectOnceIf(effect, false));

    expect(effect).not.toHaveBeenCalled();
  });

  it("should call effect when condition is true", () => {
    const effect = jest.fn();

    renderHook(() => useEffectOnceIf(effect, true));

    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("should only call effect once even if re-rendered with condition still true", () => {
    const effect = jest.fn();

    const { rerender } = renderHook(() => useEffectOnceIf(effect, true));

    expect(effect).toHaveBeenCalledTimes(1);

    rerender();
    rerender();

    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("should call effect once when condition changes from false to true", () => {
    const effect = jest.fn();

    const { rerender } = renderHook(
      ({ condition }) => useEffectOnceIf(effect, condition),
      { initialProps: { condition: false } },
    );

    expect(effect).not.toHaveBeenCalled();

    rerender({ condition: true });

    expect(effect).toHaveBeenCalledTimes(1);

    rerender({ condition: true });

    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("should call effect only when condition becomes true for the first time", () => {
    const effect = jest.fn();

    const { rerender } = renderHook(
      ({ condition }) => useEffectOnceIf(effect, condition),
      { initialProps: { condition: true } },
    );

    expect(effect).toHaveBeenCalledTimes(1);

    rerender({ condition: false });
    rerender({ condition: true });

    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("should call cleanup function if effect returns one", () => {
    const cleanup = jest.fn();
    const effect = jest.fn(() => cleanup);

    const { unmount } = renderHook(() => useEffectOnceIf(effect, true));

    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
