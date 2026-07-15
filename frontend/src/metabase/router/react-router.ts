// The single module that imports the `react-router` package directly. The rest
// of the app reaches these symbols through `metabase/router`, so later phases can
// swap the engine behind this seam without touching call sites.
//
// The v7-shaped API (useNavigate, useLocation, Link, Navigate, Outlet, Route, ...)
// lives in the sibling facade modules. This file only re-exports the raw v3 symbols
// that have not been given a v7 shape yet (withRouter, history helpers, the route
// builders the `Route`/`redirect` shims are built on) plus the raw Link/LinkProps
// under `Router`-prefixed names for the few call sites that need the unstyled
// primitive.
import type { RouteProps as BaseRouteProps } from "react-router";

export {
  Link as RouterLink,
  // The raw v3 `<Route>`, used by the `Route` shim to run v3's route builder over
  // a `<Route index>` element without recursing back into the shim's own builder.
  Route as ReactRouterRoute,
  Router,
  createMemoryHistory,
  createRoutes,
  formatPattern,
  useRouterHistory,
  withRouter,
} from "react-router";

// v3's own path matcher, used to work out how much of the URL each matched route
// accounts for. Its pattern syntax has corners a hand-rolled parser gets wrong
// (optional groups like `database(/:databaseId)`, splats), so the engine's
// matcher is the only safe reader of it. Goes away with the engine swap.
export { matchPattern } from "react-router/lib/PatternUtils";

export type {
  InjectedRouter,
  LinkProps as RouterLinkProps,
  PlainRoute,
  RouteComponent,
  WithRouterProps,
} from "react-router";

/**
 * v3's route lifecycle hooks. They have no v7 equivalent, and the app now does
 * this work in components and effects instead, so they are dropped from the route
 * props to keep them from coming back.
 */
type LifecycleHook = "onEnter" | "onChange" | "onLeave";

export type RouteProps = Omit<BaseRouteProps, LifecycleHook>;
