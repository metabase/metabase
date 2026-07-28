import { type PropsWithChildren, createContext } from "react";

import type { WithRouterProps } from "./types";
import { RouterProviderV7 } from "./v7/RouterProviderV7";
import type { LocationMirror } from "./v7/location-mirror";

type RouterContextType = WithRouterProps;

/**
 * The router state the facade hooks read, published per route by `RouterBridge`.
 */
export const RouterContext = createContext<RouterContextType | null>(null);

/**
 * Hosts the app on react-router v7.
 *
 * Pass `createLocationMirror(store.dispatch)` as `onLocationChange` to mirror
 * every location into `state.routing`.
 */
export const RouterProvider = ({
  children,
  onLocationChange,
}: PropsWithChildren<{ onLocationChange?: LocationMirror }>) => (
  <RouterProviderV7 onLocationChange={onLocationChange}>
    {children}
  </RouterProviderV7>
);
