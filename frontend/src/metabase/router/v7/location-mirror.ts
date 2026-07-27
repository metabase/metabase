import type { NavigationType, Location as V7Location } from "react-router";

import { LOCATION_CHANGE } from "../routing-reducer";
import type { Location } from "../types";

import { toV3Location } from "./location";
import { notifyLocationListeners } from "./navigator";

export type LocationMirror = (
  location: V7Location,
  action: NavigationType,
) => void;

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
 * Mirrors each location into `state.routing` and the `router.listen`
 * subscribers. Replaces v3's `syncHistoryWithStore`.
 *
 * Pass the result to `RouterProvider` as `onLocationChange`: it runs inside the
 * history subscription, so the store is current before any thunk reads it.
 * Thunks read the store synchronously right after navigating
 * (`setEditingDashboard` pushes `{ ...getLocation(getState()) }`), so a store
 * that lags a render makes them push a stale location and clobber query params
 * that were just set.
 */
export function createLocationMirror(
  dispatch: DispatchLocationChange,
): LocationMirror {
  return (location, action) => {
    const v3Location = toV3Location(location, action);
    dispatch({ type: LOCATION_CHANGE, payload: v3Location });
    notifyLocationListeners(v3Location);
  };
}
