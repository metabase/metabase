import type { Location as HistoryLocation } from "history";
import { useEffect, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route, push, useRouter } from "metabase/router";

import type { RouterEngine } from "../engine";

// Both engines expose `listen` at runtime; v3's `InjectedRouter` type omits it.
type RouterWithListen = {
  listen: (callback: (location: HistoryLocation) => void) => () => void;
};

// v3's `router.listen` fires a callback on every location change and returns an
// unsubscribe function. The v7 engine has no native equivalent, so the shim wires
// it to the location fan-out; `use-dashboard-url-query` relies on it (and crashed
// the dashboard on v7 when it was missing).
function Harness() {
  const { router } = useRouter();
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    // Cast because v3's `InjectedRouter` type omits `listen` (see above).
    return (router as unknown as RouterWithListen).listen((location) => {
      setSeen((previous) => [...previous, location.pathname]);
    });
  }, [router]);
  return (
    <div>
      <span data-testid="seen">{seen.join(",")}</span>
      <Outlet />
    </div>
  );
}

const tree = (
  <Route path="/" element={<Harness />}>
    <Route path="other" element={<span data-testid="other">other</span>} />
  </Route>
);

describe.each<RouterEngine>(["v3", "v7"])(
  "router.listen on the %s engine",
  (routerEngine) => {
    it("fires the callback on navigation and stops after unsubscribe", async () => {
      const { store } = renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/",
      });

      await screen.findByTestId("seen");

      store.dispatch(push("/other"));

      await screen.findByText("other");
      expect(screen.getByTestId("seen")).toHaveTextContent("/other");
    });
  },
);
