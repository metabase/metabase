import type { Location } from "history";
import { createContext } from "react";
import type { createBrowserRouter } from "react-router-dom";
import { RouterProvider as RouterProviderV7 } from "react-router-dom";

import type { PlainRoute, RouterAdapter } from "metabase/routing/compat/types";

type RouterContextType = {
  router: RouterAdapter;
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
 */
export const RouterProvider = ({ routerV7 }: RouterProviderProps) => {
  if (!routerV7) {
    throw new Error("RouterProvider requires a v7 router instance");
  }

  return <RouterProviderV7 router={routerV7} />;
};
