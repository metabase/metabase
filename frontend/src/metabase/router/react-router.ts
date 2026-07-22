// The single module that imports the `react-router` package directly. The rest
// of the app reaches these symbols through `metabase/router`.
//
// The v7-shaped API (useNavigate, useLocation, Link, Navigate, Outlet, Route, ...)
// lives in the sibling facade modules. What is left here is the v3 pattern
// machinery the facade still resolves relative paths with, plus the v3 types the
// injected route props are annotated as. Both are re-homed when the react-router
// package is dropped.
import type { RouteProps as BaseRouteProps } from "react-router";

export { formatPattern } from "react-router";

// v3's own path matcher, used to work out how much of the URL each matched route
// accounts for. Its pattern syntax has corners a hand-rolled parser gets wrong
// (optional groups like `database(/:databaseId)`, splats), so it is the only safe
// reader of the translated patterns `mapToV7` stashes on `handle`.
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
