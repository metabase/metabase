import { act, renderHook } from "@testing-library/react";

import { useDataAppLocation } from "./use-data-app-location";

// A data app mounts no router, so navigation runs on the native history and
// `pushState` fires no event: `navigate` has to notify subscribers itself, and
// every consumer must hear about it.
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

  it("follows browser back/forward", () => {
    const { result } = renderHook(() => useDataAppLocation());

    act(() => {
      window.history.pushState(null, "", "/orders/7");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.pathname).toBe("/orders/7");
  });
});
