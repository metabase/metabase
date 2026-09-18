import { fireEvent, renderHook } from "__support__/ui";

import { useIsShiftPressed } from "./use-is-shift-pressed";

describe("useIsShiftPressed", () => {
  it("tracks the Shift modifier across keyboard events", () => {
    const { result } = renderHook(() => useIsShiftPressed());

    expect(result.current).toBe(false);

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(result.current).toBe(true);

    fireEvent.keyUp(window, { key: "Shift", shiftKey: false });
    expect(result.current).toBe(false);
  });

  it("reads shiftKey from non-Shift keyboard events", () => {
    const { result } = renderHook(() => useIsShiftPressed());

    fireEvent.keyDown(window, { key: "A", shiftKey: true });

    expect(result.current).toBe(true);
  });

  it("resets when the window loses focus", () => {
    const { result } = renderHook(() => useIsShiftPressed());

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    fireEvent.blur(window);

    expect(result.current).toBe(false);
  });

  it("does not track Shift while disabled", () => {
    const { result } = renderHook(() => useIsShiftPressed(false));

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });

    expect(result.current).toBe(false);
  });

  it("resets when disabled and resumes tracking when re-enabled", () => {
    let enabled = true;
    const { result, rerender } = renderHook(() => useIsShiftPressed(enabled));

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(result.current).toBe(true);

    enabled = false;
    rerender();
    expect(result.current).toBe(false);

    enabled = true;
    rerender();
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(result.current).toBe(true);
  });
});
