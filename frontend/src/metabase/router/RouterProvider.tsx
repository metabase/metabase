import { type PropsWithChildren, createContext } from "react";

import type { WithRouterProps } from "./react-router";
import { RouterProviderV7 } from "./v7/RouterProviderV7";

type RouterContextType = WithRouterProps;

/**
 * The router state the facade hooks read, published per route by `RouterBridge`.
 */
export const RouterContext = createContext<RouterContextType | null>(null);

/**
 * Hosts the app on react-router v7.
 */
export const RouterProvider = ({ children }: PropsWithChildren) => (
  <RouterProviderV7>{children}</RouterProviderV7>
);
