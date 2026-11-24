import { type JSX, useEffect } from "react";

import { act, render, renderRoutes, screen } from "__support__/ui";
import {
  type MemoryTestRouterHolder,
  type NavigateFunction,
  type RouteObject,
  RouterProviderMemory,
  getIsNavigationPending,
  useNavigate,
} from "metabase/router";

import { CHUNK_WAIT_MS } from "./lazy-page";

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

    act(() => {
      router?.navigate("/split");
    });

    expect(router?.location.pathname).toBe("/");
    expect(seen).toEqual([]);

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/split");
    expect(seen).toEqual(["/split"]);

    unsubscribe?.();
  });

  it("keeps the previous page mounted while the module loads", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    act(() => {
      router?.navigate("/split");
    });

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
        loadingFallback={<span data-testid="hydrating">loading</span>}
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

    act(() => {
      router?.navigate("/split");
    });
    act(() => {
      router?.navigate("/");
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router?.location.pathname).toBe("/");
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("split")).not.toBeInTheDocument();
  });

  // How a caller sits that window out. `getIsNavigationPending` reads it from
  // the router, so it is already true on the line after the navigate rather than
  // after the render that follows. A URL sync running in a promise callback gets
  // no render in between, which is how the query builder came to replace the
  // dashboard it had just saved a question into.
  it("reports the window to a caller navigating in the same tick", async () => {
    const { navigate } = setupCapturingNavigate();

    act(() => {
      navigate?.("/split");
    });
    expect(getIsNavigationPending()).toBe(true);

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(getIsNavigationPending()).toBe(false);
  });

  // The other half of the contract, and the more easily broken one. A route that
  // is already loaded commits during the call, so there is no window to sit out
  // and a URL sync that follows must still run. Reporting one here strands
  // anything that mirrors state into the URL, which is most of the query
  // builder. See QueryBuilder.unsaved-changes-warning.unit.spec.tsx.
  it("reports no window for a navigation that commits during the call", () => {
    const { navigate } = setupCapturingNavigate();

    act(() => {
      navigate?.("/plain");
    });

    expect(getIsNavigationPending()).toBe(false);
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

    act(() => {
      router?.navigate("/split");
    });
    expect(router?.location.pathname).toBe("/");

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/split");
  });

  // The wait is a cap, not a delay. A chunk that comes back inside it commits
  // the way it always did, and the page mounts with no fallback in between: one
  // that mounted here would flash on every first visit to a route.
  it("does not mount the fallback when the chunk arrives inside the wait", async () => {
    const fallbackMounted = jest.fn();

    function Fallback() {
      useEffect(() => fallbackMounted(), []);
      return <span data-testid="loading">loading</span>;
    }

    const routerHolder: MemoryTestRouterHolder = { current: null };

    render(
      <RouterProviderMemory
        routes={makeRoutes()}
        initialRoute="/"
        routerHolder={routerHolder}
        loadingFallback={<Fallback />}
      />,
    );

    await act(async () => {
      routerHolder.current?.navigate("/split");
    });

    expect(screen.getByTestId("split")).toBeInTheDocument();
    expect(fallbackMounted).not.toHaveBeenCalled();
  });

  // react-router resolves `lazy` onto the route object itself, so the cost is
  // paid once per chunk rather than on every navigation into the subtree.
  it("is synchronous again on the second visit", async () => {
    const { router } = renderRoutes(makeRoutes(), { initialRoute: "/" });

    act(() => {
      router?.navigate("/split");
    });
    expect(await screen.findByTestId("split")).toBeInTheDocument();

    act(() => {
      router?.navigate("/");
    });
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      router?.navigate("/split");
    });

    expect(router?.location.pathname).toBe("/split");
  });
});

/**
 * What happens when the chunk does not come back quickly. The point of the wait
 * running out is that a slow network can no longer leave a click looking like
 * nothing happened: the location commits, and the page shows a spinner until
 * the chunk lands.
 */
describe("a lazy route whose chunk is slow", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("commits the location once the wait runs out, then shows the page", async () => {
    jest.useFakeTimers();
    const chunk = deferChunk();
    const routerHolder: MemoryTestRouterHolder = { current: null };

    render(
      <RouterProviderMemory
        routes={[
          { path: "/", element: <Home /> },
          { path: "/split", lazy: () => chunk.promise },
        ]}
        initialRoute="/"
        routerHolder={routerHolder}
        loadingFallback={<span data-testid="loading">loading</span>}
      />,
    );

    act(() => {
      routerHolder.current?.navigate("/split");
    });

    expect(routerHolder.current?.state.location.pathname).toBe("/");
    expect(screen.getByTestId("home")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(CHUNK_WAIT_MS);
    });

    expect(routerHolder.current?.state.location.pathname).toBe("/split");
    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();

    await act(async () => {
      chunk.resolve();
    });

    expect(screen.getByTestId("split")).toBeInTheDocument();
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
  });

  // The wait is per chunk, not per route: the routes that share a loader share
  // the component that stands in for it, so moving between two of them is still
  // one mount. A dozen query builder routes depend on that.
  it("keeps one component across the routes that share a chunk", async () => {
    const mount = jest.fn();

    function Split() {
      useEffect(() => mount(), []);
      return <span data-testid="split">split</span>;
    }

    const load = async () => ({ Component: Split });
    const { router } = renderRoutes(
      [
        { path: "/one", lazy: load },
        { path: "/two", lazy: load },
      ],
      { initialRoute: "/one" },
    );

    expect(await screen.findByTestId("split")).toBeInTheDocument();

    await act(async () => {
      router?.navigate("/two");
    });
    await screen.findByTestId("split");

    expect(router?.location.pathname).toBe("/two");
    expect(mount).toHaveBeenCalledTimes(1);
  });
});

/**
 * A chunk that arrives when the test says so, standing in for a fetch that is
 * still in flight when the wait runs out.
 */
function deferChunk() {
  let resolve: () => void = () => undefined;

  const promise = new Promise<{ Component: () => JSX.Element }>((settle) => {
    resolve = () => settle({ Component: Split });
  });

  return {
    promise,
    resolve: () => resolve(),
  };
}

/**
 * Renders with a `useNavigate` handle, so a test can navigate and then read the
 * pending state in the same tick, the way a promise callback does.
 */
function setupCapturingNavigate() {
  let navigate: NavigateFunction | undefined;

  function CaptureNavigate() {
    navigate = useNavigate();
    return <span data-testid="home">home</span>;
  }

  renderRoutes(
    [
      { path: "/", element: <CaptureNavigate /> },
      { path: "/plain", element: <Split /> },
      { path: "/split", lazy: async () => ({ Component: Split }) },
    ],
    { initialRoute: "/" },
  );

  return {
    get navigate() {
      return navigate;
    },
  };
}
