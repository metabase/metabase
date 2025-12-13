import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";
import { Route, Router, type WithRouterProps, withRouter } from "react-router";
import type { PlainRoute } from "react-router/lib/Route";
import type { Params } from "react-router/lib/Router";

import { useHistory } from "metabase/history";

export type RouterContextType<TParams extends Params = Params> =
  WithRouterProps<TParams> & {
    route: PlainRoute | undefined;
  };

export const RouterContext = createContext<RouterContextType | null>(null);

const RouterContextProviderBase = <TParams extends Params = Params>({
  router,
  location,
  params,
  routes,
  children,
}: PropsWithChildren<RouterContextType<TParams>>) => {
  return (
    <RouterContext.Provider
      value={{
        router,
        location,
        params,
        routes,
        route: routes.at(-1),
      }}
    >
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
 */
export const RouterProvider = ({
  children,
}: PropsWithChildren<RouterProviderProps>) => {
  const { history } = useHistory();

  return (
    <Router history={history}>
      <Route component={RouterContextProvider}>{children}</Route>
    </Router>
  );
};
