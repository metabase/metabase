import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";

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
  return (
    <RouterContext.Provider value={{ router, location, params, routes }}>
      {children}
    </RouterContext.Provider>
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
