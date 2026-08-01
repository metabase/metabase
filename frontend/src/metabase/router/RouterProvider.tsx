import type { PropsWithChildren } from "react";

import { RouterProviderV7 } from "./RouterProviderV7";
import type { LocationMirror } from "./location-mirror";

/**
 * Hosts the app on react-router v7.
 *
 * Pass `createLocationMirror(store.dispatch)` as `onLocationChange` to emit a
 * LOCATION_CHANGE for every navigation (the `isNavbarOpen` / `errorPage`
 * reducers and trace-id rotation react to it).
 */
export const RouterProvider = ({
  children,
  onLocationChange,
}: PropsWithChildren<{ onLocationChange?: LocationMirror }>) => (
  <RouterProviderV7 onLocationChange={onLocationChange}>
    {children}
  </RouterProviderV7>
);
