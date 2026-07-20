import type { Location as HistoryLocation, LocationDescriptor } from "history";
import { type ReactNode, useContext, useMemo } from "react";
import {
  UNSAFE_RouteContext,
  type NavigateFunction as V7NavigateFunction,
  Outlet as V7Outlet,
  useNavigationType,
  useLocation as useV7Location,
  useNavigate as useV7Navigate,
  useParams as useV7Params,
} from "react-router-v7";

import { OutletContext, RouteContext } from "../Outlet";
import { RouterContext } from "../RouterProvider";
import type {
  InjectedRouter,
  PlainRoute,
  WithRouterProps,
} from "../react-router";
import type { Route } from "../route";

import { registerLeaveHook } from "./blocking-history";
import { toV3Location } from "./location";
import { toNavigateArgs } from "./navigator";

/**
 * Runs as the `element` of every v7 route and republishes v7's location,
 * params, matched-route branch, and an imperative-router shim into the shared
 * `RouterContext` (and the `Outlet`/`Route` contexts). The facade hooks
 * (`useLocation`, `useParams`, `useNavigate`, `useRouter`, `withRouteProps`)
 * read that context unchanged, so nothing downstream can tell which engine it
 * runs on. Deleted with the v3 engine in Phase 4.
 */
export function RouterBridge({
  v3Element,
}: {
  v3Element: ReactNode;
}): JSX.Element {
  const v7Location = useV7Location();
  const navigate = useV7Navigate();
  const action = useNavigationType();
  // v7's `useParams` returns v7's readonly `Params`; the context wants v3's shape,
  // which is structurally the same string map.
  const params = useV7Params() as WithRouterProps["params"];

  // `useMatches` is data-router-only, so read the matched branch from the route
  // context that also drives `<Outlet>` (available in declarative mode). Each
  // route keeps its v3 path on `handle`, which the facade hooks match against.
  const { matches } = useContext(UNSAFE_RouteContext);
  const routes = useMemo<PlainRoute[]>(
    () =>
      matches.map((match) => {
        // `handle` is typed `unknown`; we only ever put `{ v3Path }` on it.
        const handle = match.route.handle as { v3Path?: string } | undefined;
        // The facade hooks read only `route.path`, so a `{ path }` stub is enough.
        return { path: handle?.v3Path } as PlainRoute;
      }),
    [matches],
  );

  const location = useMemo<HistoryLocation>(
    () => toV3Location(v7Location, action),
    [v7Location, action],
  );

  const router = useMemo<InjectedRouter>(
    () => makeRouterShim(navigate),
    [navigate],
  );

  const value = useMemo<WithRouterProps>(
    () => ({ router, location, params, routes }),
    [router, location, params, routes],
  );

  // The injected `route` prop / `useRoute()`: consumers only read it to hand back
  // to `setRouteLeaveHook`, which ignores the route arg on v7, so the leaf match's
  // `{ path }` is enough. Cast because the facade types the injected route as `Route`.
  const route = (routes.at(-1) ?? null) as Route | null;

  return (
    <RouterContext.Provider value={value}>
      <RouteContext.Provider value={route}>
        <OutletContext.Provider value={<V7Outlet />}>
          {v3Element}
        </OutletContext.Provider>
      </RouteContext.Provider>
    </RouterContext.Provider>
  );
}

/**
 * The v3 `InjectedRouter` (`router.push/replace/go/...`) reimplemented over v7's
 * `navigate`. The facade's `useNavigate` has already resolved relative targets to
 * absolute paths before calling `push`/`replace`, so these pass straight through.
 * `setRouteLeaveHook` registers into the blocking history, which cancels the
 * navigation when the hook returns `false`, matching v3. The route arg is unused:
 * the hook is registered only while its component is mounted on that route.
 */
function makeRouterShim(navigate: V7NavigateFunction): InjectedRouter {
  const href = (location: LocationDescriptor) =>
    typeof location === "string"
      ? location
      : `${location.pathname ?? ""}${location.search ?? ""}${location.hash ?? ""}`;

  return {
    push: (location) => navigate(...toNavigateArgs(location)),
    replace: (location) =>
      navigate(...toNavigateArgs(location, { replace: true })),
    go: (n) => navigate(n),
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    setRouteLeaveHook: (_route, hook) => registerLeaveHook(hook),
    createPath: href,
    createHref: href,
    isActive: () => false,
  };
}
