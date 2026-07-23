import { act, renderHook } from "@testing-library/react";

import { useDataAppLocation } from "./useDataAppLocation";

// The data-app bundle mounts no router, so this navigation runs on the dedicated
// browser history `getDataAppHistory()` returns, not the app's router history.
// Regression guard: when it read `getCurrentHistory()` (null outside a router),
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
});
