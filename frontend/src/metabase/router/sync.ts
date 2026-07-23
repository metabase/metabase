import { LOCATION_CHANGE, type RouterState } from "./routing-reducer";
import type { History } from "./types";

// Only the slice of the redux store `sync` actually touches. Declared
// structurally rather than as `Store<State>` so this leaf does not instantiate
// RTK's store generic against the whole app state.
type RoutingStore = {
  getState: () => { routing: RouterState };
  dispatch: (action: { type: string; payload: unknown }) => unknown;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Re-owned equivalent of react-router-redux's `syncHistoryWithStore`.
 *
 * Location flows history -> store: every history transition dispatches
 * LOCATION_CHANGE so `state.routing.locationBeforeTransitions` tracks it. The
 * returned history is enhanced so its `listen` is driven by the store, which is
 * what the v3 <Router> subscribes to, keeping the rendered route in sync with
 * redux.
 */
export function syncHistoryWithStore(
  history: History,
  store: RoutingStore,
): History {
  const getLocationInStore = () =>
    store.getState().routing.locationBeforeTransitions;

  history.listen((location) => {
    store.dispatch({ type: LOCATION_CHANGE, payload: location });
  });

  // history@3 does not call listeners synchronously on subscribe, so mirror the
  // initial location into the store ourselves.
  store.dispatch({
    type: LOCATION_CHANGE,
    payload: history.getCurrentLocation(),
  });

  return {
    ...history,
    listen(listener) {
      let lastLocation = getLocationInStore();
      return store.subscribe(() => {
        const location = getLocationInStore();
        if (location && location !== lastLocation) {
          lastLocation = location;
          listener(location);
        }
      });
    },
  };
}
