import { useEffect, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route, push, useRouter } from "metabase/router";

import type { RouterEngine } from "../engine";

// v3's `router.listen` fires a callback on every location change and returns an
// unsubscribe function. The v7 engine has no native equivalent, so the shim wires
// it to the location fan-out; `use-dashboard-url-query` relies on it (and crashed
// the dashboard on v7 when it was missing).
function Harness() {
  const { router } = useRouter();
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    // `listen` is absent from v3's `InjectedRouter` type but present at runtime.
    return router.listen((location) => {
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
