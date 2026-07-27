import { type ReactNode, useContext, useMemo, useRef } from "react";
import {
  type NavigateOptions,
  type To,
  UNSAFE_RouteContext,
  type NavigateFunction as V7NavigateFunction,
  Outlet as V7Outlet,
  useNavigationType,
  useLocation as useV7Location,
  useNavigate as useV7Navigate,
  useParams as useV7Params,
} from "react-router";

import { OutletContext, RouteContext } from "../Outlet";
import { RouterContext } from "../RouterProvider";
import type { Route } from "../route";
import type {
  Location as HistoryLocation,
  InjectedRouter,
  LocationDescriptor,
  PlainRoute,
  WithRouterProps,
} from "../types";

import { registerLeaveHook } from "./blocking-history";
import { toV3Location } from "./location";
import { subscribeLocation, toNavigateArgs } from "./navigator";

// The facade route stub, plus the route's matched pathname so `setRouteLeaveHook`
// can scope its hook to the route the way v3 does.
type RouteStub = PlainRoute & { pathnameBase?: string };

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
  const v7Params = useV7Params();
  // v7's `useParams` returns v7's readonly `Params`; the context wants v3's shape,
  // which is structurally the same string map apart from the splat: v3 exposed the
  // wildcard match as `splat`, v7 names it `*`. Republish it under both so v3-era
  // readers (`params.splat` in `AutomaticDashboardApp`) keep working.
  const params = useMemo<WithRouterProps["params"]>(() => {
    const { "*": splat, ...rest } = v7Params;
    const v3Params = splat === undefined ? rest : { ...rest, splat };
    // Cast because v7 types params as readonly and partial; v3's shape is the same
    // string map.
    return v3Params as WithRouterProps["params"];
  }, [v7Params]);

  // `useMatches` is data-router-only, so read the matched branch from the route
  // context that also drives `<Outlet>` (available in declarative mode). Each
  // route keeps its v3 path on `handle`, which the facade hooks match against.
  const { matches } = useContext(UNSAFE_RouteContext);
  // react-router hands back a fresh `matches` array on every render, so memoizing
  // on it would republish a new `routes`/`route` each time. v3's were stable, and
  // consumers key effects on `route`: the leave-confirm modal resets itself when
  // `route` changes, which closed it mid-interaction. Key on the matched branch.
  const matchesKey = matches
    .map((match) => {
      // `handle` is typed `unknown`; we only ever put `{ path, props }` on it.
      const handle = match.route.handle as { path?: string } | undefined;
      return `${match.pathname}|${handle?.path ?? ""}`;
    })
    .join(">");
  const routes = useMemo<RouteStub[]>(
    () =>
      matches.map((match) => {
        // `handle` is typed `unknown`; we only ever put `{ path, props }` on it.
        const handle = match.route.handle as
          | { path?: string; props?: PlainRoute["props"] }
          | undefined;
        // The facade hooks read `route.path`; `pathnameBase` is the route's matched
        // pathname, which `setRouteLeaveHook` uses to scope its hook to this route.
        // `props` carries the arbitrary route props v3 exposed (the command palette
        // reads `route.props.disableCommandPalette`).
        return {
          path: handle?.path,
          props: handle?.props,
          pathnameBase: match.pathname,
        };
      }),
    // Keyed on the matched branch, not the array identity, which changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchesKey],
  );

  const location = useMemo<HistoryLocation>(
    () => toV3Location(v7Location, action),
    [v7Location, action],
  );

  // v3 handed consumers a stable `router`, so effects keyed on it (notably the
  // `router.listen` subscriptions in `use-dashboard-url-query`) survive a
  // navigation. v7's `navigate` changes identity per location, which would tear
  // those effects down and re-subscribe them around every location change, so read
  // `navigate` through a ref and keep the shim itself stable.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const router = useMemo<InjectedRouter>(() => {
    const navigateLatest = (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigateRef.current(to);
      } else {
        navigateRef.current(to, options);
      }
    };
    // `NavigateFunction` is an overloaded signature (a `To` or a delta); the
    // wrapper implements both arms but TS cannot infer it back into the overload.
    return makeRouterShim(navigateLatest as V7NavigateFunction);
  }, []);

  const value = useMemo<WithRouterProps>(
    () => ({ router, location, params, routes }),
    [router, location, params, routes],
  );

  // The injected `route` prop / `useRoute()`: consumers hand it back to
  // `setRouteLeaveHook`, which reads its `pathnameBase` to scope the hook. Cast
  // because the facade types the injected route as `Route`.
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
 * navigation when the hook returns `false`, matching v3. The route's matched
 * pathname scopes the hook, so it fires only when the destination leaves that
 * route, the way v3's `listenBeforeLeavingRoute` does.
 */
function makeRouterShim(navigate: V7NavigateFunction): InjectedRouter {
  const href = (location: LocationDescriptor) =>
    typeof location === "string"
      ? location
      : `${location.pathname ?? ""}${location.search ?? ""}${location.hash ?? ""}`;

  // Cast because v3's own `InjectedRouter` type omits `listen`, even though both
  // engines expose it at runtime.
  return {
    push: (location) => navigate(...toNavigateArgs(location)),
    replace: (location) =>
      navigate(...toNavigateArgs(location, { replace: true })),
    go: (n) => navigate(n),
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    setRouteLeaveHook: (route, hook) => {
      // The facade types the route arg as v3's `Route`; on v7 it is our stub,
      // which carries the matched `pathnameBase` used to scope the hook.
      const basePath = (route as RouteStub | undefined)?.pathnameBase;
      return registerLeaveHook(hook, basePath);
    },
    createPath: href,
    createHref: href,
    isActive: () => false,
    // Stands in for v3's `router.listen` (used by e.g. `use-dashboard-url-query`).
    // `V7RouterBridge` feeds these subscribers every location change.
    listen: subscribeLocation,
  } as InjectedRouter;
}
