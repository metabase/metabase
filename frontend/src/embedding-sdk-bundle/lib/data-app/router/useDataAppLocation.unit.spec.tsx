import { act, renderHook } from "@testing-library/react";

import { useDataAppLocation } from "./useDataAppLocation";

// The data-app bundle mounts no router, so this navigation runs on the dedicated
// browser history `getRawBrowserHistory()` returns, not the app's router history.
// Regression guard: when it read the app router history (null outside a router),
// every `navigate` was a silent no-op.
describe("useDataAppLocation", () => {
  it("navigate() updates the sub-path and the iframe URL", () => {
    const { result } = renderHook(() => useDataAppLocation());

    act(() => {
      result.current.navigate("/orders/42");
    });

    expect(result.current.pathname).toBe("/orders/42");
    expect(window.location.pathname).toBe("/orders/42");
  });

  it("supports multiple consumers", () => {
    const { result: firstResult } = renderHook(() => useDataAppLocation());
    const { result: secondResult } = renderHook(() => useDataAppLocation());

    act(() => {
      firstResult.current.navigate("/orders/42");
    });

    expect(firstResult.current.pathname).toBe("/orders/42");
    expect(secondResult.current.pathname).toBe("/orders/42");
  });
});
