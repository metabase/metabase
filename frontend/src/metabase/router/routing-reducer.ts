import type { Action } from "@reduxjs/toolkit";
import type { Location } from "history";

/**
 * Re-owned equivalent of react-router-redux's `routerReducer`.
 *
 * Mirrors the current location into `state.routing.locationBeforeTransitions`.
 * Both the slice shape and the LOCATION_CHANGE action type are preserved so
 * `getLocation` and the `isNavbarOpen` / `errorPage` reducers keep working
 * unchanged.
 */
export const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";

export interface RouterState {
  locationBeforeTransitions: Location | null;
}

// react-router-redux's reducer starts with a null location and relies on
// `getLocation`'s default to guard reads until the history sync populates it.
const INITIAL_STATE: RouterState = {
  locationBeforeTransitions: null,
};

interface LocationChangeAction extends Action<typeof LOCATION_CHANGE> {
  payload: Location;
}

function isLocationChange(action: Action): action is LocationChangeAction {
  return action.type === LOCATION_CHANGE;
}

export function routing(
  state: RouterState = INITIAL_STATE,
  action: Action,
): RouterState {
  if (isLocationChange(action)) {
    return { ...state, locationBeforeTransitions: action.payload };
  }
  return state;
}
