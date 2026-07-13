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
import type { ReactElement } from "react";
import type { PlainRoute, RouteProps as BaseRouteProps } from "react-router";

export {
  Link as RouterLink,
  Router,
  createMemoryHistory,
  formatPattern,
  useRouterHistory,
  withRouter,
} from "react-router";

// v3's route-config builder, used by the `Route` shim to turn a `<Route>` element
// (and its children) into a plain route object. `@types/react-router` only types
// the `createRoutes` wrapper, so declare the leaf we actually need. Goes away with
// the engine swap.
export { createRouteFromReactElement } from "react-router/lib/RouteUtils";

declare module "react-router/lib/RouteUtils" {
  export function createRouteFromReactElement(
    element: ReactElement,
    parentRoute?: PlainRoute,
  ): PlainRoute;
}

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
