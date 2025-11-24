import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";
import { Route, Router, type WithRouterProps, withRouter } from "react-router";

export const RouterContext = createContext<WithRouterProps | null>(null);

const RouterContextProviderBase = ({
  router,
  location,
  params,
  routes,
  children,
}: PropsWithChildren<WithRouterProps>) => {
  return (
    <RouterContext.Provider value={{ router, location, params, routes }}>
      {children}
    </RouterContext.Provider>
  );
};

const RouterContextProvider = withRouter(RouterContextProviderBase);

type RouterProviderProps = {
  history: History;
};

/**
 * This provider encapsulates react-router initiation and puts router and routes references to the context
 * This is v3's only solution to provide a router and routes.
 * Without extra Route component it doesn't work.
 */
export const RouterProvider = ({
  history,
  children,
}: PropsWithChildren<RouterProviderProps>) => {
  return (
    <Router history={history}>
      <Route component={RouterContextProvider}>{children}</Route>
    </Router>
  );
};
