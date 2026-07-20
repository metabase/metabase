import type { History } from "history";
import { type PropsWithChildren, createContext, useMemo } from "react";

import { useHistory } from "metabase/history";

import {
  ReactRouterRoute,
  Router,
  type WithRouterProps,
  withRouter,
} from "./react-router";

type RouterContextType = WithRouterProps;

export const RouterContext = createContext<RouterContextType | null>(null);

const RouterContextProviderBase = ({
  router,
  location,
  params,
  routes,
  children,
}: PropsWithChildren<RouterContextType>) => {
  // Memoize on the injected parts so a re-render that leaves them unchanged does
  // not hand consumers a fresh object. Under the `element` bridge, navigation
  // commits twice (the facade context update, then v3's own route re-render), and
  // an unmemoized value would re-propagate on that second, location-unchanged
  // render. That extra render breaks pages that derive transient state from
  // `usePrevious(location.key)` (e.g. the document /new -> /new leave prompt),
  // which `component`-based v3 routes never saw because v3 re-renders them once.
  const value = useMemo(
    () => ({ router, location, params, routes }),
    [router, location, params, routes],
  );
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
};

const RouterContextProvider = withRouter(RouterContextProviderBase);

type RouterProviderProps = {
  history?: History | undefined;
};

/**
 * This provider encapsulates react-router initiation and puts router and routes references to the context
 * This is v3's only solution to provide a router and routes.
 * Without extra Route component it doesn't work.
 * Additionally, it provides the history reference
 *
 * Uses the raw v3 `Route` here (not the facade's `element`-based one): this is the
 * component that establishes the router context, so it cannot itself consume that
 * context through `<Outlet/>`.
 */
export const RouterProvider = ({
  children,
}: PropsWithChildren<RouterProviderProps>) => {
  const { history } = useHistory();
  return (
    <Router history={history}>
      <ReactRouterRoute component={RouterContextProvider}>
        {children}
      </ReactRouterRoute>
    </Router>
  );
};
