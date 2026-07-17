import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";

import { useHistory } from "metabase/history";

import { type RouterEngine, getRouterEngine } from "./engine";
import {
  ReactRouterRoute,
  Router,
  type WithRouterProps,
  withRouter,
} from "./react-router";
import { RouterProviderV7 } from "./v7/RouterProviderV7";

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
const RouterProviderV3 = ({
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

type RouterProviderPropsWithEngine = RouterProviderProps & {
  /**
   * Which engine hosts the app. Defaults to the `use-v7-router` flag; tests pass
   * it explicitly to exercise both engines. Goes away with the v3 engine.
   */
  engine?: RouterEngine;
};

/**
 * Hosts the app on either engine. On v7 the facade hooks read the same
 * `RouterContext`, filled per route by the `RouterBridge` instead of v3's
 * `withRouter`, so nothing downstream changes.
 */
export const RouterProvider = ({
  children,
  engine = getRouterEngine(),
}: PropsWithChildren<RouterProviderPropsWithEngine>) => {
  if (engine === "v7") {
    return <RouterProviderV7>{children}</RouterProviderV7>;
  }
  return <RouterProviderV3>{children}</RouterProviderV3>;
};
