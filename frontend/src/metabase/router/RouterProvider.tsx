import type { Location } from "history";
import { type PropsWithChildren, createContext } from "react";
import type { createBrowserRouter } from "react-router-dom";
import {
  unstable_HistoryRouter as HistoryRouter,
  RouterProvider as RouterProviderV7,
} from "react-router-dom";

import { useHistory } from "metabase/history";
import type { InjectedRouter, PlainRoute } from "metabase/routing/compat/types";

type RouterContextType = {
  router: InjectedRouter;
  location: Location;
  params: Record<string, string | undefined>;
  routes: PlainRoute[];
};

export const RouterContext = createContext<RouterContextType | null>(null);

type RouterProviderProps = {
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

  if (routerV7) {
    return <RouterProviderV7 router={routerV7} />;
  }

  return <HistoryRouter history={history}>{children}</HistoryRouter>;
};
