import type { Location as ReactRouterLocation } from "react-router";

import { toFacadeLocation } from "./location";
import { LOCATION_CHANGE } from "./location-change";
import { notifyLocationListeners } from "./navigator";
import type { Location } from "./types";

export type LocationMirror = (location: ReactRouterLocation) => void;

/**
 * The dispatch half of a redux store, narrowed to what the mirror needs. Taking
 * the function rather than importing `metabase/redux` keeps the router free of
 * a dependency on the store it happens to feed.
 */
type DispatchLocationChange = (action: {
  type: typeof LOCATION_CHANGE;
  payload: Location;
}) => void;

/**
 * Emits LOCATION_CHANGE on every navigation and notifies the `router.listen`
 * subscribers. Replaces v3's `syncHistoryWithStore`.
 *
 * Pass the result to `RouterProvider` as `onLocationChange`: it runs inside the
 * history subscription, so the reducers keyed off LOCATION_CHANGE
 * (`isNavbarOpen`, `errorPage`) and trace-id rotation settle as part of the
 * transition rather than after a render.
 */
export function createLocationMirror(
  dispatch: DispatchLocationChange,
): LocationMirror {
  return (location) => {
    const facadeLocation = toFacadeLocation(location);
    dispatch({ type: LOCATION_CHANGE, payload: facadeLocation });
    notifyLocationListeners(facadeLocation);
  };
}
