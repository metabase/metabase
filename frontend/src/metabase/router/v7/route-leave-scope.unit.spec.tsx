import { useEffect } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import {
  Outlet,
  Route,
  push,
  useLocation,
  useRoute,
  useRouter,
} from "metabase/router";

import type { RouterEngine } from "../engine";

// Registers an always-blocking leave hook scoped to the route it is rendered on,
// exactly as the leave-confirm modals do (guard on a parent layout route).
function Guard() {
  const { router } = useRouter();
  const route = useRoute();
  useEffect(
    () => router.setRouteLeaveHook(route, () => false),
    [router, route],
  );
  return null;
}

function Layout() {
  const { pathname } = useLocation();
  return (
    <div>
      <span data-testid="location">{pathname}</span>
      <Guard />
      <Outlet />
    </div>
  );
}

const tree = (
  <Route path="/">
    <Route path="section" element={<Layout />}>
      <Route path="a" element={<span data-testid="a">a</span>} />
      <Route path="b" element={<span data-testid="b">b</span>} />
    </Route>
    <Route path="other" element={<span data-testid="other">other</span>} />
  </Route>
);

// v3's `setRouteLeaveHook` is scoped to the guarded route: it fires only when a
// navigation leaves that route's subtree. So moving between sibling child routes
// under the guarded layout is allowed, and only leaving the layout is blocked.
describe.each<RouterEngine>(["v3", "v7"])(
  "route-scoped leave hook on the %s engine",
  (routerEngine) => {
    it("allows navigation that stays within the guarded route", async () => {
      const { store } = renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/section/a",
      });
      expect(await screen.findByTestId("a")).toBeInTheDocument();

      store.dispatch(push("/section/b"));

      expect(await screen.findByTestId("b")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/section/b");
    });

    it("blocks navigation that leaves the guarded route", async () => {
      const { store } = renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/section/a",
      });
      expect(await screen.findByTestId("a")).toBeInTheDocument();

      store.dispatch(push("/other"));

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByTestId("other")).not.toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/section/a");
    });
  },
);
