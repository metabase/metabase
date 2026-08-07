import { render, renderRoutes, screen } from "__support__/ui";
import { type RouteObject, RouterProviderMemory } from "metabase/router";

function Home() {
  return <span data-testid="home">home</span>;
}

function Split() {
  return <span data-testid="split">split</span>;
}

function makeRoutes(): RouteObject[] {
  return [
    { path: "/", element: <Home /> },
    { path: "/split", lazy: async () => ({ Component: Split }) },
  ];
}

/**
 * Navigation is synchronous while no route is `lazy`: react-router commits the
 * location without awaiting anything. A `lazy` route breaks that for its own
 * first visit, which is the behavior every code-split subtree buys into. These
 * pin how far the change reaches.
 */
describe("a lazy route", () => {
  it("defers the location until the module resolves", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    const seen: string[] = [];
    const unsubscribe = router?.onLocationChange(({ pathname }) =>
      seen.push(pathname),
    );

    router?.navigate("/split");

    expect(router?.location.pathname).toBe("/");
    expect(seen).toEqual([]);

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/split");
    expect(seen).toEqual(["/split"]);

    unsubscribe?.();
  });

  it("keeps the previous page mounted while the module loads", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    router?.navigate("/split");

    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(await screen.findByTestId("split")).toBeInTheDocument();
  });

  // The router does not initialize until the first URL's match resolves, so a
  // deep link into a split subtree has no tree to render at all, chrome
  // included. The app passes a fallback for exactly that window.
  it("shows the hydrate fallback on a deep link, then the page", async () => {
    render(
      <RouterProviderMemory
        routes={makeRoutes()}
        initialRoute="/split"
        hydrateFallback={<span data-testid="hydrating">loading</span>}
      />,
    );

    expect(screen.getByTestId("hydrating")).toBeInTheDocument();
    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(screen.queryByTestId("hydrating")).not.toBeInTheDocument();
  });

  // The sharp edge of deferring the location. A second navigation arriving
  // before the module resolves does not queue behind the first, it replaces it,
  // and the destination the user asked for is dropped with no trace. Anything
  // that navigates on a timer or from an effect has to sit this window out:
  // `useDashboardUrlQuery` skips its URL sync on `useIsNavigating` for exactly
  // this reason.
  it("drops a pending navigation if another one lands first", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    router?.navigate("/split");
    router?.navigate("/");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router?.location.pathname).toBe("/");
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("split")).not.toBeInTheDocument();
  });

  // What prefetching on hover buys, and what it does not. The module is already
  // in hand, so the gap is a tick rather than a round trip, but the router still
  // awaits `lazy` and still commits the location late.
  it("defers the location even when the module is already loaded", async () => {
    const load = jest.fn().mockResolvedValue({ Component: Split });
    const { router } = renderRoutes(
      [
        { path: "/", element: <Home /> },
        {
          path: "/split",
          lazy: load,
        },
      ],
      { initialRoute: "/" },
    );

    await load();

    router?.navigate("/split");
    expect(router?.location.pathname).toBe("/");

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/split");
  });

  // react-router resolves `lazy` onto the route object itself, so the cost is
  // paid once per chunk rather than on every navigation into the subtree.
  it("is synchronous again on the second visit", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    router?.navigate("/split");
    expect(await screen.findByTestId("split")).toBeInTheDocument();

    router?.navigate("/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    router?.navigate("/split");

    expect(router?.location.pathname).toBe("/split");
  });
});
