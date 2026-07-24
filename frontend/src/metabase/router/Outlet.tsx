import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { Route } from "./route";

export const OutletContext = createContext<ReactNode>(null);

export const RouteContext = createContext<Route | null>(null);

/**
 * The route matched for the nearest `element`-based route ancestor, published by
 * `RouterBridge`. Consumers hand it back to `setRouteLeaveHook`.
 */
export function useRoute(): Route | null {
  return useContext(RouteContext);
}

/**
 * react-router v7's `<Outlet>`: renders the matched child route (or nothing when
 * there is none).
 *
 * @see https://reactrouter.com/7.18.1/api/components/Outlet
 */
export function Outlet(): JSX.Element {
  const child = useContext(OutletContext);
  return <>{child}</>;
}
