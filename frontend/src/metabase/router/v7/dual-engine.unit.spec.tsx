import { useEffect } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  Outlet,
  Route,
  push,
  useLocation,
  useParams,
  useRouter,
} from "metabase/router";
import { getLocation } from "metabase/selectors/routing";

import type { RouterEngine } from "../engine";

function Home() {
  const { pathname } = useLocation();
  return (
    <div>
      <span data-testid="location">{pathname}</span>
      <Outlet />
    </div>
  );
}

function Page() {
  const { id } = useParams();
  return <span data-testid="page-id">{id}</span>;
}

// Registers a route-leave hook the way the leave-confirm modals do, cancelling
// the navigation when `block` is set.
function LeaveGuard({ block }: { block: boolean }) {
  const { router, routes } = useRouter();
  const route = routes.at(-1);
  useEffect(
    () => router.setRouteLeaveHook(route, () => (block ? false : undefined)),
    [router, route, block],
  );
  return null;
}

const tree = (
  <Route path="/" element={<Home />}>
    <Route path="page/:id" element={<Page />} />
    <Route path="other" element={<span data-testid="other">other</span>} />
  </Route>
);

function setup(routerEngine: RouterEngine, initialRoute: string) {
  return renderWithProviders(tree, {
    withRouter: true,
    routerEngine,
    initialRoute,
  });
}

describe.each<RouterEngine>(["v3", "v7"])(
  "route tree on the %s engine",
  (routerEngine) => {
    it("matches a deep link and reads its params", async () => {
      setup(routerEngine, "/page/7");
      expect(await screen.findByTestId("page-id")).toHaveTextContent("7");
      expect(screen.getByTestId("location")).toHaveTextContent("/page/7");
    });

    it("navigates via dispatch(push())", async () => {
      const { store } = setup(routerEngine, "/page/7");
      expect(await screen.findByTestId("page-id")).toBeInTheDocument();

      store.dispatch(push("/other"));

      expect(await screen.findByTestId("other")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/other");
    });
  },
);

// setRouteLeaveHook must cancel navigation on both engines so the flag stays a
// reliable two-way switch: v3 blocks natively, v7 through the blocking history.
describe.each<RouterEngine>(["v3", "v7"])(
  "route-leave blocking on the %s engine",
  (routerEngine) => {
    const blockingTree = (
      <Route path="/" element={<Home />}>
        <Route
          path="page/:id"
          element={
            <>
              <Page />
              <LeaveGuard block />
            </>
          }
        />
        <Route path="other" element={<span data-testid="other">other</span>} />
      </Route>
    );

    const openTree = (
      <Route path="/" element={<Home />}>
        <Route
          path="page/:id"
          element={
            <>
              <Page />
              <LeaveGuard block={false} />
            </>
          }
        />
        <Route path="other" element={<span data-testid="other">other</span>} />
      </Route>
    );

    it("cancels navigation while the hook returns false", async () => {
      const { store } = renderWithProviders(blockingTree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/page/7",
      });
      expect(await screen.findByTestId("page-id")).toBeInTheDocument();

      store.dispatch(push("/other"));

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByTestId("other")).not.toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/page/7");
    });

    it("allows navigation when the hook does not block", async () => {
      const { store } = renderWithProviders(openTree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/page/7",
      });
      expect(await screen.findByTestId("page-id")).toBeInTheDocument();

      store.dispatch(push("/other"));

      expect(await screen.findByTestId("other")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/other");
    });
  },
);

// v3 tests never wired `syncHistoryWithStore`, so `state.routing` only tracks the
// location on v7, through the redux bridge. This pins that the bridge feeds it.
describe("v7 redux bridge", () => {
  it("mirrors the location into state.routing", async () => {
    const { store } = setup("v7", "/page/7");
    await waitFor(() => {
      expect(getLocation(store.getState())?.pathname).toBe("/page/7");
    });

    store.dispatch(push("/other"));

    await waitFor(() => {
      expect(getLocation(store.getState())?.pathname).toBe("/other");
    });
  });
});
