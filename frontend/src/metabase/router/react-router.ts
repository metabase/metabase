// The single module that imports the `react-router` package directly. The rest
// of the app reaches these symbols through `metabase/router`, so later phases can
// swap the engine behind this seam without touching call sites.
//
// The v7-shaped API (useNavigate, useLocation, Link, Navigate, Outlet, ...) lives
// in the sibling facade modules. This file only re-exports the raw v3 symbols that
// have not been given a v7 shape yet (route-tree components, withRouter, history
// helpers) plus the raw Link/LinkProps under `Router`-prefixed names for the few
// call sites that need the unstyled primitive.
export {
  IndexRedirect,
  IndexRoute,
  Link as RouterLink,
  Redirect,
  Route,
  Router,
  createMemoryHistory,
  useRouterHistory,
  withRouter,
} from "react-router";

export type {
  InjectedRouter,
  LinkProps as RouterLinkProps,
  PlainRoute,
  RouteComponent,
  RouteProps,
  WithRouterProps,
} from "react-router";
