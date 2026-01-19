import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";
import { Route, Router, type WithRouterProps, withRouter } from "react-router";
import { RouterProvider as RouterProviderV7 } from "react-router-dom";
import type { createBrowserRouter } from "react-router-dom";

import { useHistory } from "metabase/history";
import { USE_REACT_ROUTER_V7 } from "metabase/routing/compat";

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
  /**
   * For v7: the router instance created by createBrowserRouter
   */
  routerV7?: ReturnType<typeof createBrowserRouter>;
};

/**
 * This provider encapsulates react-router initiation and puts router and routes references to the context
 *
 * For React Router v3:
 * - Uses Router from react-router with history
 * - Wraps children in Route component to provide context
 *
 * For React Router v7:
 * - Uses RouterProvider from react-router-dom
 * - Expects a router instance created by createBrowserRouter
 */
export const RouterProvider = ({
  children,
  routerV7,
}: PropsWithChildren<RouterProviderProps>) => {
  const { history } = useHistory();

  // Use v7 RouterProvider if enabled and router is provided
  if (USE_REACT_ROUTER_V7 && routerV7) {
    return <RouterProviderV7 router={routerV7} />;
  }

  // Fall back to v3 Router
  return (
    <Router history={history}>
      <Route component={RouterContextProvider}>{children}</Route>
    </Router>
  );
};
